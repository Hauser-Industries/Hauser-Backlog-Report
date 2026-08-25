import { join, resolve } from 'node:path'
import electron, { type BrowserWindow as BrowserWindowType } from 'electron'
import log from 'electron-log/main'
import type { BacklogDataSource } from './data/backlogDataSource'
import { getDataSourceMode } from './config/dataSourceMode'
import { MockBacklogDataSource } from './data/mock/mockBacklogDataSource'
import { PendingLiveBacklogDataSource } from './data/pendingLiveBacklogDataSource'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { OAuthPkceProvider } from './netsuite/auth/oauthPkceProvider'
import { NetSuiteHttpClient } from './netsuite/client/netsuiteHttpClient'
import { SuiteQlClient } from './netsuite/client/suiteQlClient'
import { NetSuiteConnectionAdapter } from './netsuite/connection/netSuiteConnectionAdapter'
import { NetSuiteCustomerIdResolver } from './netsuite/connection/netSuiteCustomerIdResolver'
import {
  NetSuiteEnvironmentConnectionManager,
  type NetSuiteEnvironmentSession
} from './netsuite/connection/netSuiteEnvironmentConnectionManager'
import { NetSuiteRestConnectionTester } from './netsuite/connection/netSuiteRestConnectionTester'
import { NetSuiteSalesOrderInspector } from './netsuite/connection/netSuiteSalesOrderInspector'
import { NetSuiteSuiteQlTester } from './netsuite/connection/netSuiteSuiteQlTester'
import { NetSuiteBacklogDataSource } from './netsuite/dataSource/netSuiteBacklogDataSource'
import { NetSuiteBacklogRepository } from './netsuite/repositories/backlogRepository'
import { VerifiedBacklogQueryFactory } from './netsuite/queries/backlogQuery'
import { NetSuiteSalesOrderDetailProvider } from './netsuite/details/salesOrderDetailProvider'
import { NetSuiteWorkOrderRelationshipResolver } from './netsuite/workOrders/workOrderRelationshipResolver'
import {
  NETSUITE_ENVIRONMENT_PROFILES,
  type NetSuiteEnvironmentProfile
} from './netsuite/config/environmentProfiles'
import {
  createNetSuiteOAuthEndpoints,
  loadNetSuiteConfig,
  type NetSuiteConfigState
} from './netsuite/config/netsuiteConfig'
import { BacklogService } from './services/backlogService'
import { ConnectionService } from './services/connectionService'
import { OAuthDeepLinkRouter } from './services/oauthDeepLinkRouter'
import { SafeStorageRefreshTokenStore } from './storage/encryptedTokenStore'
import type { DataSourceMode } from '@shared/types/backlog'

const APP_PROTOCOL = 'hauser-backlog'
const { app, BrowserWindow, Menu } = electron
const deepLinkRouter = new OAuthDeepLinkRouter()
let mainWindow: BrowserWindowType | null = null

log.initialize()
log.transports.file.level = import.meta.env.DEV ? 'debug' : 'info'
log.transports.console.level = import.meta.env.DEV ? 'debug' : 'warn'

function readLiveConfiguration(): NetSuiteConfigState {
  try {
    return loadNetSuiteConfig()
  } catch (error) {
    log.error('NetSuite configuration validation failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError'
    })
    return {
      configured: false,
      missing: ['accountId', 'suiteTalkUrl', 'clientId', 'redirectUri', 'scope']
    }
  }
}

function createBacklogDataSource(
  mode: DataSourceMode,
  configState: NetSuiteConfigState,
  liveDataSource?: BacklogDataSource
): BacklogDataSource {
  return (
    mode === 'mock'
      ? new MockBacklogDataSource()
      : (liveDataSource ?? new PendingLiveBacklogDataSource(configState))
  )
}

function createLiveConnectionAdapter(
  mode: DataSourceMode,
  configState: NetSuiteConfigState
): NetSuiteEnvironmentConnectionManager | undefined {
  if (mode !== 'live' || !configState.configured) return undefined

  const manager = new NetSuiteEnvironmentConnectionManager({
    profiles: NETSUITE_ENVIRONMENT_PROFILES,
    initialEnvironment: 'production',
    createSession: createNetSuiteEnvironmentSession
  })

  deepLinkRouter.setConsumer(async (callbackUrl) => {
    try {
      await manager.handleOAuthCallback(callbackUrl)
    } finally {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload()
    }
  })

  return manager
}

function createNetSuiteEnvironmentSession(
  profile: NetSuiteEnvironmentProfile
): NetSuiteEnvironmentSession {
  const configState = loadNetSuiteConfig(profile)
  if (!configState.configured) {
    throw new Error(`NetSuite ${profile.environment} configuration is incomplete.`)
  }

  const authProvider = new OAuthPkceProvider({
    config: configState.config,
    endpoints: createNetSuiteOAuthEndpoints(configState.config),
    tokenStore: new SafeStorageRefreshTokenStore({
      tokenNamespace: configState.config.accountId,
      migrateLegacyGenericToken: profile.environment === 'sandbox'
    })
  })
  const restConnectionTester = new NetSuiteRestConnectionTester({
    config: configState.config,
    authProvider
  })
  const httpClient = new NetSuiteHttpClient({
    config: configState.config,
    authProvider
  })
  const suiteQlClient = new SuiteQlClient(httpClient)
  const salesOrderDetailProvider = new NetSuiteSalesOrderDetailProvider(httpClient, suiteQlClient)
  const workOrderRelationshipResolver = new NetSuiteWorkOrderRelationshipResolver(suiteQlClient)
  const suiteQlConnectionTester = new NetSuiteSuiteQlTester({ suiteQlClient })
  const customerIdResolver = new NetSuiteCustomerIdResolver({ suiteQlClient })
  const salesOrderInspector = new NetSuiteSalesOrderInspector({
    suiteQlClient,
    environmentProfile: profile
  })
  const backlogDataSource = new NetSuiteBacklogDataSource({
    backlogRepository: new NetSuiteBacklogRepository(
      suiteQlClient,
      new VerifiedBacklogQueryFactory(profile),
      { verified: true, orderedSign: 'invert' },
      workOrderRelationshipResolver
    )
  })
  const adapter = new NetSuiteConnectionAdapter(
    authProvider,
    configState.config,
    restConnectionTester,
    suiteQlConnectionTester,
    customerIdResolver,
    salesOrderInspector
  )

  return {
    getBacklog: (filter) => backlogDataSource.getBacklog(filter),
    getSalesOrder: (salesOrderNumber) => backlogDataSource.getSalesOrder(salesOrderNumber),
    getSalesOrderDetails: (salesOrderInternalId) =>
      salesOrderDetailProvider.getDetails(salesOrderInternalId),
    invalidateDetails: () => salesOrderDetailProvider.invalidate(),
    getStatus: () => adapter.getStatus(),
    signIn: () => adapter.signIn(),
    signOut: () => adapter.signOut(),
    testConnection: () => adapter.testConnection(),
    testSuiteQl: () => adapter.testSuiteQl(),
    resolveCustomerIds: () => adapter.resolveCustomerIds(),
    inspectSalesOrder: (salesOrderNumber) => adapter.inspectSalesOrder(salesOrderNumber),
    handleOAuthCallback: (callbackUrl) => adapter.handleOAuthCallback(callbackUrl),
    clearVolatileAuthentication: () => authProvider.clearVolatileState()
  }
}

function findDeepLink(argv: string[]): string | undefined {
  return argv.find((argument) => argument.toLowerCase().startsWith(`${APP_PROTOCOL}://`))
}

function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function processDeepLink(url: string): void {
  if (deepLinkRouter.accept(url)) {
    log.info('Received a valid OAuth callback')
    focusMainWindow()
  }
}

function registerProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [resolve(process.argv[1])])
    return
  }
  app.setAsDefaultProtocolClient(APP_PROTOCOL)
}

function createWindow(): BrowserWindowType {
  const window = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#eef1f2',
    title: 'Hauser Backlog Report',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: import.meta.env.DEV
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())

  if (import.meta.env.DEV && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  return window
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLink = findDeepLink(argv)
    if (deepLink) processDeepLink(deepLink)
    focusMainWindow()
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    processDeepLink(url)
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    registerProtocol()

    const mode = getDataSourceMode()
    const configState = readLiveConfiguration()
    const liveConnectionAdapter = createLiveConnectionAdapter(mode, configState)
    const backlogService = new BacklogService(
      createBacklogDataSource(mode, configState, liveConnectionAdapter)
    )
    const connectionService = new ConnectionService(mode, liveConnectionAdapter, {
      configured: configState.configured,
      ...(configState.configured ? { accountLabel: configState.config.accountId } : {}),
      ...(mode === 'live' && configState.configured
        ? { message: 'Production report access uses the authenticated read-only SuiteQL session.' }
        : {})
    })
    registerIpcHandlers({ backlog: backlogService, connection: connectionService })

    log.info('Application services initialized', {
      version: app.getVersion(),
      dataSource: mode
    })

    mainWindow = createWindow()

    const initialDeepLink = findDeepLink(process.argv)
    if (initialDeepLink) processDeepLink(initialDeepLink)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
