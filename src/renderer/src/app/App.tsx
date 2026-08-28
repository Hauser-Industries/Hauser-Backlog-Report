import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ALL_CUSTOMERS_LABEL,
  ALL_CUSTOMERS_VALUE,
  ALLOWED_CUSTOMERS
} from '@shared/constants/customers'
import type {
  AppInfo,
  BacklogFilter,
  BacklogPrintRequest,
  BacklogPrintSnapshot,
  BacklogResponse,
  ConnectionStatus,
  InspectSalesOrderResult,
  NetSuiteEnvironment,
  PurchaseOrderSearchRequest,
  ResolveCustomerIdsResult,
  SalesOrderSearchRequest,
  SuiteQlTestResult
} from '@shared/types/backlog'
import { formatDateTime } from '@shared/utils/date'
import { normalizeSalesOrderNumber } from '@shared/utils/salesOrder'
import { normalizePurchaseOrderNumber } from '@shared/utils/purchaseOrder'
import {
  requiresStartupAuthorization,
  shouldBeginStartupAuthorization,
  shouldLoadBacklogAtStartup
} from '@shared/utils/startupMode'
import { AlertIcon, PrintIcon, RefreshIcon, SearchIcon, SlidersIcon } from '../components/icons'
import { BacklogTable } from '../features/backlog/BacklogTable'
import { PrintableBacklogReport } from '../features/backlog/PrintableBacklogReport'
import { AuthenticationStage } from '../features/connection/AuthenticationStage'
import { ConnectionPanel } from '../features/connection/ConnectionPanel'

type LoadingAction =
  | 'initial'
  | 'filter'
  | 'search'
  | 'refresh'
  | 'connection'
  | 'suiteql'
  | 'customer-resolution'
  | 'sales-order-inspection'
  | 'environment'
  | 'print'
  | null

const INITIAL_CONNECTION: ConnectionStatus = {
  dataSource: 'live',
  configured: false,
  authenticated: false,
  indicator: 'authentication-required'
}

const SALES_ORDER_PAGE_SIZE = 50

function selectedCustomerFilter(selectedCustomer: string, page = 0): BacklogFilter {
  return selectedCustomer === ALL_CUSTOMERS_VALUE
    ? { page, pageSize: SALES_ORDER_PAGE_SIZE }
    : { customerName: selectedCustomer, page, pageSize: SALES_ORDER_PAGE_SIZE }
}

function searchRequest(
  salesOrderNumber: string,
  selectedCustomer: string
): SalesOrderSearchRequest {
  return selectedCustomer === ALL_CUSTOMERS_VALUE
    ? { salesOrderNumber }
    : { salesOrderNumber, customerName: selectedCustomer }
}

function purchaseOrderSearchRequest(
  purchaseOrderNumber: string,
  selectedCustomer: string
): PurchaseOrderSearchRequest {
  return selectedCustomer === ALL_CUSTOMERS_VALUE
    ? { purchaseOrderNumber }
    : { purchaseOrderNumber, customerName: selectedCustomer }
}

function selectedCustomerName(selectedCustomer: string): string | undefined {
  return selectedCustomer === ALL_CUSTOMERS_VALUE ? undefined : selectedCustomer
}

function waitForPrintableLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function connectionLabel(status: ConnectionStatus): string {
  let label: string
  switch (status.indicator) {
    case 'mock-data':
      label = 'Mock Data'
      break
    case 'connected':
      label = 'NetSuite Connected'
      break
    case 'disconnected':
      label = 'NetSuite Disconnected'
      break
    case 'authentication-required':
      label = 'Authentication Required'
      break
    case 'connection-error':
      label = 'Connection Error'
      break
  }
  return status.environment ? `${status.environment.toUpperCase()} · ${label}` : label
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('not configured') || normalized.includes('field mapping')) {
    return 'NetSuite has not been configured for this installation.'
  }
  if (normalized.includes('401') || normalized.includes('authentication')) {
    return 'Your NetSuite authentication has expired. Sign in again and retry.'
  }
  if (normalized.includes('403') || normalized.includes('permission')) {
    return 'The NetSuite integration role does not have permission to retrieve the required data.'
  }
  if (normalized.includes('429') || normalized.includes('rate limit')) {
    return 'NetSuite is temporarily limiting requests. Wait a moment and try again.'
  }
  if (
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout')
  ) {
    return 'Unable to reach NetSuite. Check your network connection and try again.'
  }

  return message || 'The report could not be loaded. Try again.'
}

export function App() {
  const [selectedCustomer, setSelectedCustomer] = useState<string>(ALL_CUSTOMERS_VALUE)
  const [salesOrderInput, setSalesOrderInput] = useState('')
  const [activeSalesOrder, setActiveSalesOrder] = useState<string | null>(null)
  const [purchaseOrderInput, setPurchaseOrderInput] = useState('')
  const [activePurchaseOrder, setActivePurchaseOrder] = useState<string | null>(null)
  const [response, setResponse] = useState<BacklogResponse | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus>(INITIAL_CONNECTION)
  const [suiteQlResult, setSuiteQlResult] = useState<SuiteQlTestResult | null>(null)
  const [customerResolutionResult, setCustomerResolutionResult] =
    useState<ResolveCustomerIdsResult | null>(null)
  const [salesOrderInspectionInput, setSalesOrderInspectionInput] = useState('')
  const [salesOrderInspectionValidation, setSalesOrderInspectionValidation] = useState<
    string | null
  >(null)
  const [salesOrderInspectionResult, setSalesOrderInspectionResult] =
    useState<InspectSalesOrderResult | null>(null)
  const [connectionReady, setConnectionReady] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [loadingAction, setLoadingAction] = useState<LoadingAction>('initial')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValidation, setSearchValidation] = useState<string | null>(null)
  const [purchaseOrderValidation, setPurchaseOrderValidation] = useState<string | null>(null)
  const [printSnapshot, setPrintSnapshot] = useState<BacklogPrintSnapshot | null>(null)
  const [printMessage, setPrintMessage] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const requestSequence = useRef(0)
  const initialLoadStarted = useRef(false)

  const runReportRequest = useCallback(
    async (
      action: Exclude<
        LoadingAction,
        | 'connection'
        | 'suiteql'
        | 'customer-resolution'
        | 'sales-order-inspection'
        | null
        | 'environment'
      >,
      request: () => Promise<BacklogResponse>
    ) => {
      const requestId = ++requestSequence.current
      setLoadingAction(action)
      setErrorMessage(null)

      try {
        const nextResponse = await request()
        if (requestId === requestSequence.current) setResponse(nextResponse)
      } catch (error) {
        if (requestId === requestSequence.current) setErrorMessage(friendlyError(error))
      } finally {
        if (requestId === requestSequence.current) setLoadingAction(null)
      }
    },
    []
  )

  const loadBacklog = useCallback(
    (action: 'initial' | 'filter' | 'refresh' = 'filter', page = 0) =>
      runReportRequest(action, () => {
        const filter = selectedCustomerFilter(selectedCustomer, page)
        return action === 'refresh'
          ? window.hauserBacklog.refreshBacklog(filter)
          : window.hauserBacklog.getBacklog(filter)
      }),
    [runReportRequest, selectedCustomer]
  )

  const beginStartupAuthorization = useCallback(async () => {
    setLoadingAction('connection')
    setErrorMessage(null)
    try {
      setConnection(await window.hauserBacklog.signIn())
    } catch (error) {
      setErrorMessage(friendlyError(error))
    } finally {
      setLoadingAction(null)
    }
  }, [])

  useEffect(() => {
    if (initialLoadStarted.current) return
    initialLoadStarted.current = true

    void window.hauserBacklog
      .getConnectionStatus()
      .then((status) => {
        setConnection(status)
        setConnectionReady(true)
        if (shouldBeginStartupAuthorization(status)) {
          void beginStartupAuthorization()
          return undefined
        }
        if (shouldLoadBacklogAtStartup(status)) return loadBacklog('initial')
        setLoadingAction(null)
        return undefined
      })
      .catch((error: unknown) => {
        setConnectionReady(true)
        setLoadingAction(null)
        setErrorMessage(friendlyError(error))
      })
    void window.hauserBacklog
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => undefined)
  }, [beginStartupAuthorization, loadBacklog])

  const handleCustomerChange = (value: string) => {
    requestSequence.current += 1
    setSelectedCustomer(value)
    setActiveSalesOrder(null)
    setActivePurchaseOrder(null)
    setSalesOrderInput('')
    setPurchaseOrderInput('')
    setSearchValidation(null)
    setPurchaseOrderValidation(null)
    setPrintMessage(null)
    setResponse(null)
  }

  useEffect(() => {
    if (
      !initialLoadStarted.current ||
      activeSalesOrder !== null ||
      activePurchaseOrder !== null ||
      loadingAction === 'initial'
    )
      return
    void loadBacklog('filter')
    // selectedCustomer is intentionally the trigger; loadBacklog carries the current value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer])

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearchValidation(null)

    let normalized: string
    try {
      normalized = normalizeSalesOrderNumber(salesOrderInput)
    } catch (error) {
      setSearchValidation(friendlyError(error))
      return
    }

    setSalesOrderInput(normalized)
    setActiveSalesOrder(normalized)
    setPurchaseOrderInput('')
    setActivePurchaseOrder(null)
    setPurchaseOrderValidation(null)
    setPrintMessage(null)
    void runReportRequest('search', () =>
      window.hauserBacklog.searchSalesOrder(searchRequest(normalized, selectedCustomer))
    )
  }

  const handleClearSalesOrderSearch = () => {
    const wasActive = activeSalesOrder !== null
    setSalesOrderInput('')
    setActiveSalesOrder(null)
    setSearchValidation(null)
    if (wasActive) void loadBacklog('filter', 0)
  }

  const handlePurchaseOrderSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPurchaseOrderValidation(null)

    let normalized: string
    try {
      normalized = normalizePurchaseOrderNumber(purchaseOrderInput)
    } catch (error) {
      setPurchaseOrderValidation(friendlyError(error))
      return
    }

    setPurchaseOrderInput(normalized)
    setActivePurchaseOrder(normalized)
    setSalesOrderInput('')
    setActiveSalesOrder(null)
    setSearchValidation(null)
    setPrintMessage(null)
    void runReportRequest('search', () =>
      window.hauserBacklog.searchPurchaseOrder(
        purchaseOrderSearchRequest(normalized, selectedCustomer)
      )
    )
  }

  const handleClearPurchaseOrderSearch = () => {
    const wasActive = activePurchaseOrder !== null
    setPurchaseOrderInput('')
    setActivePurchaseOrder(null)
    setPurchaseOrderValidation(null)
    if (wasActive) void loadBacklog('filter', 0)
  }

  const handleRefresh = () => {
    if (activeSalesOrder) {
      void runReportRequest('refresh', () =>
        window.hauserBacklog.searchSalesOrder({
          ...searchRequest(activeSalesOrder, selectedCustomer),
          refreshDetails: true
        })
      )
      return
    }
    if (activePurchaseOrder) {
      void runReportRequest('refresh', () =>
        window.hauserBacklog.searchPurchaseOrder({
          ...purchaseOrderSearchRequest(activePurchaseOrder, selectedCustomer),
          refreshDetails: true
        })
      )
      return
    }
    void loadBacklog('refresh', response?.page ?? 0)
  }

  const handlePrintPdf = async () => {
    const customerName = selectedCustomerName(selectedCustomer)
    const request: BacklogPrintRequest = {
      scope: { kind: 'customer', ...(customerName ? { customerName } : {}) }
    }

    setLoadingAction('print')
    setErrorMessage(null)
    setPrintMessage('Preparing all expanded report rows for PDF...')
    setPrintSnapshot(null)
    try {
      const snapshot = await window.hauserBacklog.prepareBacklogPrint(request)
      if (snapshot.salesOrders.length === 0) {
        setPrintMessage('There are no report records to print for the current selection.')
        return
      }
      setPrintSnapshot(snapshot)
      await waitForPrintableLayout()
      await document.fonts.ready
      const date = new Date().toISOString().slice(0, 10)
      const result = await window.hauserBacklog.saveBacklogPdf({
        suggestedFileName: `Hauser Backlog Report - ${snapshot.scopeLabel} - ${date}.pdf`
      })
      setPrintMessage(result.message)
    } catch (error) {
      setPrintMessage(null)
      setErrorMessage(friendlyError(error))
    } finally {
      setPrintSnapshot(null)
      setLoadingAction(null)
    }
  }

  const runConnectionAction = async (action: () => Promise<ConnectionStatus>) => {
    setLoadingAction('connection')
    setErrorMessage(null)
    setSuiteQlResult(null)
    setCustomerResolutionResult(null)
    setSalesOrderInspectionResult(null)
    setSalesOrderInspectionValidation(null)
    try {
      setConnection(await action())
    } catch (error) {
      setErrorMessage(friendlyError(error))
    } finally {
      setLoadingAction(null)
    }
  }

  const runConnectionTest = async () => {
    setLoadingAction('connection')
    setErrorMessage(null)
    try {
      const result = await window.hauserBacklog.testConnection()
      setConnection(result.connectionStatus)
      if (!result.ok) {
        const statusPrefix =
          result.error.httpStatus === null ? '' : `HTTP ${result.error.httpStatus}: `
        setErrorMessage(`${statusPrefix}${result.error.message}`)
      }
    } catch (error) {
      setErrorMessage(friendlyError(error))
    } finally {
      setLoadingAction(null)
    }
  }

  const runSuiteQlTest = async () => {
    setLoadingAction('suiteql')
    setErrorMessage(null)
    setSuiteQlResult(null)
    try {
      setSuiteQlResult(await window.hauserBacklog.testSuiteQl())
    } catch (error) {
      setErrorMessage(friendlyError(error))
    } finally {
      setLoadingAction(null)
    }
  }

  const runCustomerIdResolution = async () => {
    setLoadingAction('customer-resolution')
    setErrorMessage(null)
    setCustomerResolutionResult(null)
    try {
      setCustomerResolutionResult(await window.hauserBacklog.resolveCustomerIds())
    } catch (error) {
      setErrorMessage(friendlyError(error))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleSalesOrderInspectionInputChange = (value: string) => {
    setSalesOrderInspectionInput(value)
    setSalesOrderInspectionValidation(null)
    setSalesOrderInspectionResult(null)
  }

  const runSalesOrderInspection = async () => {
    setSalesOrderInspectionValidation(null)
    setSalesOrderInspectionResult(null)

    let normalized: string
    try {
      normalized = normalizeSalesOrderNumber(salesOrderInspectionInput)
    } catch (error) {
      setSalesOrderInspectionValidation(friendlyError(error))
      return
    }

    setSalesOrderInspectionInput(normalized)
    setLoadingAction('sales-order-inspection')
    setErrorMessage(null)
    try {
      setSalesOrderInspectionResult(
        await window.hauserBacklog.inspectSalesOrder({ salesOrderNumber: normalized })
      )
    } catch (error) {
      setErrorMessage(friendlyError(error))
    } finally {
      setLoadingAction(null)
    }
  }

  const switchNetSuiteEnvironment = async (environment: NetSuiteEnvironment) => {
    if (environment === connection.environment) return

    requestSequence.current += 1
    setLoadingAction('environment')
    setErrorMessage(null)
    setSuiteQlResult(null)
    setCustomerResolutionResult(null)
    setSalesOrderInspectionResult(null)
    setSalesOrderInspectionValidation(null)
    setResponse(null)
    setActiveSalesOrder(null)
    setActivePurchaseOrder(null)
    setSalesOrderInput('')
    setPurchaseOrderInput('')
    setSearchValidation(null)
    setPurchaseOrderValidation(null)
    setPrintMessage(null)
    try {
      setConnection(await window.hauserBacklog.switchEnvironment({ environment }))
    } catch (error) {
      setErrorMessage(friendlyError(error))
    } finally {
      setLoadingAction(null)
    }
  }

  const outcomeMessage =
    response?.outcome === 'not-found'
      ? activePurchaseOrder
        ? 'No matching purchase order was found.'
        : 'No matching sales order was found.'
      : response?.outcome === 'outside-allowed-customer'
        ? 'This sales order is not associated with one of the configured Hauser Company Stores customers.'
        : null

  const emptyMessage =
    selectedCustomer === ALL_CUSTOMERS_VALUE
      ? 'No backlog records were found.'
      : 'No backlog records were found for this customer.'

  const reportBusy =
    loadingAction !== null &&
    loadingAction !== 'connection' &&
    loadingAction !== 'suiteql' &&
    loadingAction !== 'customer-resolution' &&
    loadingAction !== 'sales-order-inspection' &&
    loadingAction !== 'environment' &&
    loadingAction !== 'print'
  const printBusy = loadingAction === 'print'
  const toolbarBusy = reportBusy || printBusy
  const startupGateActive = requiresStartupAuthorization(connection)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">
            H
          </div>
          <div>
            <p className="eyebrow">Operations · Manufacturing</p>
            <h1>Hauser Backlog Report</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className={`connection-pill connection-pill--${connection.indicator}`}>
            <span aria-hidden="true" />
            {connectionLabel(connection)}
          </span>
          <button
            className="settings-button"
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            disabled={startupGateActive}
          >
            <SlidersIcon />
            Connection
          </button>
        </div>
      </header>

      <main>
        {!connectionReady ? (
          <section className="authentication-stage" aria-live="polite">
            <div className="loading-state" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <div>
                <strong>Checking NetSuite authentication…</strong>
                <span>Loading the packaged public-client configuration.</span>
              </div>
            </div>
          </section>
        ) : startupGateActive ? (
          <AuthenticationStage
            status={connection}
            busy={loadingAction === 'connection'}
            suiteQlBusy={false}
            suiteQlResult={null}
            customerResolutionBusy={false}
            customerResolutionResult={null}
            salesOrderInspectionInput=""
            salesOrderInspectionValidation={null}
            salesOrderInspectionBusy={false}
            salesOrderInspectionResult={null}
            environmentBusy={false}
            errorMessage={errorMessage}
            startupGate
            onSignIn={() => void beginStartupAuthorization()}
            onSignOut={() => undefined}
            onTestConnection={() => undefined}
            onTestSuiteQl={() => undefined}
            onResolveCustomerIds={() => undefined}
            onSalesOrderInspectionInputChange={() => undefined}
            onInspectSalesOrder={() => undefined}
            onEnvironmentChange={() => undefined}
          />
        ) : (
          <>
            {connection.dataSource === 'live' && !connection.authenticated ? (
              <section className="message-state message-state--empty report-authentication-notice">
                <AlertIcon />
                <div>
                  <h2>Connect to NetSuite to load Production data</h2>
                  <p>The report remains your home screen. Sign in from Connection when ready.</p>
                </div>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                >
                  Connection
                </button>
              </section>
            ) : null}
            <section className="report-toolbar" aria-label="Report filters">
              <label className="field customer-filter">
                <span>Customer</span>
                <select
                  value={selectedCustomer}
                  onChange={(event) => handleCustomerChange(event.target.value)}
                >
                  <option value={ALL_CUSTOMERS_VALUE}>{ALL_CUSTOMERS_LABEL}</option>
                  {ALLOWED_CUSTOMERS.map((customer) => (
                    <option key={customer} value={customer}>
                      {customer}
                    </option>
                  ))}
                </select>
              </label>

              <form className="order-search sales-order-search" onSubmit={handleSearch} noValidate>
                <label className="field">
                  <span>Sales Order</span>
                  <div
                    className={
                      searchValidation
                        ? 'input-with-icon input-with-icon--error'
                        : 'input-with-icon'
                    }
                  >
                    <SearchIcon />
                    <input
                      value={salesOrderInput}
                      onChange={(event) => {
                        setSalesOrderInput(event.target.value)
                        setPurchaseOrderInput('')
                        setSearchValidation(null)
                        setPurchaseOrderValidation(null)
                      }}
                      placeholder="1234 or SO1234"
                      aria-invalid={Boolean(searchValidation)}
                      aria-describedby={searchValidation ? 'sales-order-error' : undefined}
                    />
                  </div>
                </label>
                <button className="button button--primary" type="submit" disabled={toolbarBusy}>
                  Search
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleClearSalesOrderSearch}
                  disabled={toolbarBusy || (!activeSalesOrder && !salesOrderInput)}
                >
                  Clear
                </button>
                {searchValidation ? (
                  <p className="field-error field-error--inline" id="sales-order-error">
                    {searchValidation}
                  </p>
                ) : null}
              </form>

              <form
                className="order-search purchase-order-search"
                onSubmit={handlePurchaseOrderSearch}
                noValidate
              >
                <label className="field">
                  <span>Purchase Order</span>
                  <div
                    className={
                      purchaseOrderValidation
                        ? 'input-with-icon input-with-icon--error'
                        : 'input-with-icon'
                    }
                  >
                    <SearchIcon />
                    <input
                      value={purchaseOrderInput}
                      onChange={(event) => {
                        setPurchaseOrderInput(event.target.value)
                        setSalesOrderInput('')
                        setPurchaseOrderValidation(null)
                        setSearchValidation(null)
                      }}
                      placeholder="Enter PO #"
                      aria-invalid={Boolean(purchaseOrderValidation)}
                      aria-describedby={
                        purchaseOrderValidation ? 'purchase-order-error' : undefined
                      }
                    />
                  </div>
                </label>
                <button className="button button--primary" type="submit" disabled={toolbarBusy}>
                  Search
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleClearPurchaseOrderSearch}
                  disabled={toolbarBusy || (!activePurchaseOrder && !purchaseOrderInput)}
                >
                  Clear
                </button>
                {purchaseOrderValidation ? (
                  <p className="field-error field-error--inline" id="purchase-order-error">
                    {purchaseOrderValidation}
                  </p>
                ) : null}
              </form>

              <div className="refresh-area">
                <p>
                  Last updated <strong>{formatDateTime(response?.lastUpdated)}</strong>
                </p>
                <div className="refresh-area__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={handleRefresh}
                  disabled={toolbarBusy}
                >
                  <RefreshIcon className={loadingAction === 'refresh' ? 'spin' : undefined} />
                  {loadingAction === 'refresh' ? 'Refreshing…' : 'Refresh'}
                </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => void handlePrintPdf()}
                    disabled={toolbarBusy || !response || response.salesOrders.length === 0}
                    title="Save all expanded rows for the selected customer as a PDF"
                  >
                    <PrintIcon />
                    {printBusy ? 'Preparing PDF...' : 'Print PDF'}
                  </button>
                </div>
              </div>
            </section>

            {activeSalesOrder ? (
              <div className="active-query">
                Showing an exact Sales Order search for <strong>{activeSalesOrder}</strong>
              </div>
            ) : activePurchaseOrder ? (
              <div className="active-query">
                Showing an exact Purchase Order search for <strong>{activePurchaseOrder}</strong>
              </div>
            ) : null}

            {printMessage ? (
              <div className="print-message" role="status" aria-live="polite">
                {printMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <section className="message-state message-state--error" role="alert">
                <AlertIcon />
                <div>
                  <h2>We couldn’t load the report</h2>
                  <p>{errorMessage}</p>
                </div>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void loadBacklog('refresh', response?.page ?? 0)}
                >
                  Try Again
                </button>
              </section>
            ) : null}

            <section className="report-section" aria-busy={reportBusy}>
              <div className="report-section__heading">
                <div>
                  <p className="eyebrow">Open sales order lines</p>
                  <h2>Backlog</h2>
                </div>
                <span>{response?.totalSalesOrders ?? 0} Sales Orders</span>
              </div>

              {reportBusy && !response ? (
                <div className="loading-state" role="status">
                  <span className="loading-spinner" aria-hidden="true" />
                  <div>
                    <strong>
                      {loadingAction === 'search'
                        ? activePurchaseOrder
                          ? 'Searching Purchase Orders...'
                          : 'Searching Sales Orders...'
                        : 'Loading backlog...'}
                    </strong>
                    <span>Retrieving Sales Order headers and basic item lines.</span>
                  </div>
                </div>
              ) : outcomeMessage ? (
                <div className="message-state message-state--empty">
                  <SearchIcon />
                  <p>{outcomeMessage}</p>
                </div>
              ) : response && response.salesOrders.length === 0 ? (
                <div className="message-state message-state--empty">
                  <p>{emptyMessage}</p>
                </div>
              ) : response ? (
                <div className="table-with-progress">
                  {reportBusy ? (
                    <div className="loading-bar" role="progressbar" aria-label="Updating report" />
                  ) : null}
                  <BacklogTable
                    key={response.lastUpdated}
                    salesOrders={response.salesOrders}
                    page={response.page}
                    pageSize={response.pageSize}
                    totalSalesOrders={response.totalSalesOrders}
                    hasPrevious={response.hasPrevious}
                    hasNext={response.hasNext}
                    onPageChange={(page) => void loadBacklog('filter', page)}
                    onLoadDetails={(salesOrderInternalId) =>
                      window.hauserBacklog.getSalesOrderDetails({ salesOrderInternalId })
                    }
                    onLoadBuilt={(request) => window.hauserBacklog.getWorkOrderBuilt(request)}
                    onLoadPainted={(request) => window.hauserBacklog.getWorkOrderPainted(request)}
                  />
                </div>
              ) : null}
            </section>
          </>
        )}
      </main>

      <footer className="status-footer">
        <span>{response?.totalSalesOrders ?? 0} Sales Orders</span>
        <span>Last updated {formatDateTime(response?.lastUpdated)}</span>
        {appInfo ? <span>Version {appInfo.version}</span> : null}
        <span className="status-footer__readonly">Read-only report</span>
      </footer>

      {printSnapshot ? <PrintableBacklogReport snapshot={printSnapshot} /> : null}

      {settingsOpen ? (
        <>
          <button
            className="connection-backdrop"
            type="button"
            aria-label="Close connection settings"
            onClick={() => setSettingsOpen(false)}
          />
          <ConnectionPanel
            status={connection}
            busy={loadingAction === 'connection'}
            suiteQlBusy={loadingAction === 'suiteql'}
            suiteQlResult={suiteQlResult}
            customerResolutionBusy={loadingAction === 'customer-resolution'}
            customerResolutionResult={customerResolutionResult}
            salesOrderInspectionInput={salesOrderInspectionInput}
            salesOrderInspectionValidation={salesOrderInspectionValidation}
            salesOrderInspectionBusy={loadingAction === 'sales-order-inspection'}
            salesOrderInspectionResult={salesOrderInspectionResult}
            environmentBusy={loadingAction === 'environment'}
            onClose={() => setSettingsOpen(false)}
            onSignIn={() => void runConnectionAction(() => window.hauserBacklog.signIn())}
            onSignOut={() => void runConnectionAction(() => window.hauserBacklog.signOut())}
            onTestConnection={() => void runConnectionTest()}
            onTestSuiteQl={() => void runSuiteQlTest()}
            onResolveCustomerIds={() => void runCustomerIdResolution()}
            onSalesOrderInspectionInputChange={handleSalesOrderInspectionInputChange}
            onInspectSalesOrder={() => void runSalesOrderInspection()}
            onEnvironmentChange={(environment) => void switchNetSuiteEnvironment(environment)}
          />
        </>
      ) : null}
    </div>
  )
}
