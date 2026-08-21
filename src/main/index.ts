import { join, resolve } from 'node:path'
import electron, { type BrowserWindow as BrowserWindowType } from 'electron'
import log from 'electron-log/main'
import type { BacklogDataSource } from './data/backlogDataSource'
import { MockBacklogDataSource } from './data/mock/mockBacklogDataSource'
import { PendingLiveBacklogDataSource } from './data/pendingLiveBacklogDataSource'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { OAuthPkceProvider } from './netsuite/auth/oauthPkceProvider'
import { NetSuiteConnectionAdapter } from './netsuite/connection/netSuiteConnectionAdapter'
import {
  createNetSuiteOAuthEndpoints,
  loadNetSuiteConfig,
  type NetSuiteConfigState
} from './netsuite/config/netsuiteConfig'
import { BacklogService } from './services/backlogService'
import { ConnectionService, type LiveConnectionAdapter } from './services/connectionService'
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

function getDataSourceMode(): DataSourceMode {
  return process.env.DATA_SOURCE?.trim().toLowerCase() === 'live' ? 'live' : 'mock'
}

function readLiveConfiguration(): NetSuiteConfigState {
  try {
    return loadNetSuiteConfig()
  } catch (error) {
    log.error('NetSuite configuration validation failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError'
    })
    return {
      configured: false,
      missing: [
        'NETSUITE_ACCOUNT_ID',
        'NETSUITE_ACCOUNT_DOMAIN',
        'NETSUITE_CLIENT_ID',
        'NETSUITE_REDIRECT_URI'
      ]
    }
  }
}

function createBacklogDataSource(
  mode: DataSourceMode,
  configState: NetSuiteConfigState
): BacklogDataSource {
  return mode === 'mock'
    ? new MockBacklogDataSource()
    : new PendingLiveBacklogDataSource(configState)
}

function createLiveConnectionAdapter(
  mode: DataSourceMode,
  configState: NetSuiteConfigState
): LiveConnectionAdapter | undefined {
  if (mode !== 'live' || !configState.configured) return undefined

  const authProvider = new OAuthPkceProvider({
    config: configState.config,
    endpoints: createNetSuiteOAuthEndpoints(configState.config),
    tokenStore: new SafeStorageRefreshTokenStore()
  })
  const adapter = new NetSuiteConnectionAdapter(authProvider)

  deepLinkRouter.setConsumer(async (callbackUrl) => {
    await adapter.handleOAuthCallback(callbackUrl)
    mainWindow?.webContents.reload()
  })

  return adapter
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
    const backlogService = new BacklogService(createBacklogDataSource(mode, configState))
    const liveConnectionAdapter = createLiveConnectionAdapter(mode, configState)
    const connectionService = new ConnectionService(mode, liveConnectionAdapter, {
      configured: configState.configured,
      ...(configState.configured ? { accountLabel: 'Configured' } : {}),
      ...(mode === 'live' && configState.configured
        ? { message: 'Authentication and verified report field mappings are still required.' }
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
