# Hauser Backlog Report

Hauser Backlog Report is a read-only Windows desktop application for viewing a focused NetSuite Sales Order backlog. It groups item lines under each Sales Order, adds related Work Order information, supports exact Sales Order and Purchase Order searches, and produces a printable PDF for the selected customer scope.

The application has no hosted backend or database. NetSuite authentication, REST requests, SuiteQL queries, PDF generation, and token storage run in the Electron main process. The React renderer communicates with that process through a narrow, typed preload API.

> **Public-repository notice:** This README intentionally contains no account IDs, client IDs, role IDs, customer names/internal IDs, API hostnames, tokens, or live NetSuite output. Before publishing a fork, audit the source configuration as well as the documentation; sanitizing this README alone does not make a repository public-safe.

## Tech stack

- Electron and `electron-builder`
- React and TypeScript
- `electron-vite` and Vite
- TanStack Table
- Zod runtime validation
- NetSuite REST Web Services and REST SuiteQL
- OAuth 2.0 Authorization Code Grant with PKCE
- Electron `safeStorage`
- Vitest, ESLint, and Prettier

## What the report shows

The report is restricted to the configured customer allowlist and excludes Sales Orders whose status is Cancelled, Closed, Pending Billing, or Billed. Results are ordered by Created Date from oldest to newest.

Sales Order headers contain customer, Sales Order, PO, Created Date, and Due Date information. Their item rows contain item/description, Paint and Fabric descriptions, quantity, Built, Painted, Work Order number, and Work Order status. Optional data that cannot be resolved does not prevent the verified base order and item fields from appearing.

All NetSuite operations are read-only. The app does not create or update Sales Orders, Work Orders, customers, items, or any other NetSuite records.

## Using the application

### 1. Sign in

A normal live launch opens the Connection screen and starts an interactive browser sign-in. This launch-time authorization is required even if an encrypted refresh token already exists.

1. Complete NetSuite sign-in in the browser.
2. Select the application-approved role displayed by the desktop app.
3. Approve access.
4. NetSuite returns to the registered desktop callback, and the app opens the report only after validating the account and role.

Denial, a wrong account, a wrong role, or an incomplete callback leaves the report locked. Use **Open NetSuite Again** or **Sign in to NetSuite** to retry. Explicit **Sign out** removes the encrypted refresh token for the active environment; denying a new browser authorization does not.

### 2. Filter and search

- **Customer** selects all configured customers or one customer. Changing it clears both order searches and reloads page one.
- **Sales Order** performs an exact search. Digits alone or an `SO` prefix followed by digits are accepted and normalized.
- **Purchase Order** trims and normalizes the entry, then performs an exact PO-number search.
- The SO and PO searches are deliberately separate and mutually exclusive. Starting one clears the other.
- The selected customer still limits exact search results.
- **Clear** removes the active search and returns to page one of the selected-customer backlog.
- **Refresh** reruns the current page or exact search and clears cached optional details. Rows return collapsed; expand them again to load fresh detail data.

The report shows 50 Sales Orders per page. It supports horizontal and vertical scrolling, sticky headers, and manually resizable columns.

### 3. Expand item details

Expand a Sales Order to show its item rows. Optional Paint/Fabric details, Built values, and eligible Painted values are loaded lazily and cached. Collapsing and reopening a row reuses successful values until Refresh clears the caches.

**Expand All** and **Collapse All** operate on the Sales Orders on the visible page. Optional lookup failures leave the base report usable.

### 4. Print PDF

**Print PDF** exports the complete backlog for the selected customer, or all configured customers when **All** is selected. It is not limited to the visible page, currently expanded rows, or an active SO/PO search. Preparing an all-customer report can take longer because every page and optional detail is collected first.

The generated report uses US Letter paper in landscape orientation, expands every Sales Order, wraps long cell values, and uses the location portion of the customer name in the existing narrow Customer column. Windows then opens a Save dialog. Cancelling the dialog writes no file.

## Finding customer names and internal IDs

Customer names and NetSuite internal IDs are environment-specific. Never assume that a sandbox ID is valid in production.

### In the installed app

1. Open **Connection** from the report.
2. Confirm the **Active environment** indicator before inspecting any values.
3. Complete sign-in for that environment.
4. Select **Resolve Customer IDs**.

The read-only diagnostic displays candidate **Internal ID**, **Customer ID**, and **Company Name** values, plus configured/resolved/candidate counts. It searches both NetSuite customer-name fields because their contents can differ. Extra or missing candidates must be reviewed manually.

**Resolve Customer IDs does not save configuration.** It is a discovery and verification tool only. **Test SuiteQL** can provide a small secondary customer sample, and **Inspect Sales Order** can cross-check the customer attached to one exact Sales Order.

Do not paste diagnostic output, customer lists, screenshots, or internal IDs into public documentation, issues, or logs.

### In the source code

There are two separate customer configuration locations:

| Information                                    | Source                                                                                | Purpose                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Allowed display names                          | `src/shared/constants/customers.ts` -> `ALLOWED_CUSTOMERS`                            | Populates the Customer dropdown and enforces the renderer/service allowlist. |
| Environment-specific name/internal-ID mappings | `src/main/netsuite/config/environmentProfiles.ts` -> each profile's `customers` array | Restricts live SuiteQL queries to verified NetSuite customer internal IDs.   |

`CONFIGURED_CUSTOMERS` in the shared constants file intentionally contains names only and is not the source of live internal IDs.

When adding or changing a customer:

1. Run **Resolve Customer IDs** in the intended environment.
2. Compare Internal ID, Customer ID, and Company Name; do not auto-select an ambiguous candidate.
3. Update that environment's private name/internal-ID mapping.
4. Keep the exact customer spelling synchronized with `ALLOWED_CUSTOMERS` and NetSuite's displayed entity name.
5. Update tests that assert customer filtering/profile separation.
6. Run verification, rebuild the installer, and reinstall the new build.

The resolver targets the application's current customer naming convention. If a new customer does not follow it, update and test the resolver query rather than assuming that no record exists.

Use placeholders in public examples:

```ts
customers: [
  {
    name: '<EXACT_NETSUITE_CUSTOMER_NAME>',
    internalId: '<NUMERIC_NETSUITE_INTERNAL_ID>'
  }
]
```

## Environment and deployment configuration

Environment profiles are defined in `src/main/netsuite/config/environmentProfiles.ts` and loaded/validated through `src/main/netsuite/config/netsuiteConfig.ts`. Each profile independently supplies:

- environment name
- account ID
- SuiteTalk base URL
- public-client ID
- desktop redirect URI
- OAuth scope
- approved role identity used by callback validation
- configured customer name/internal-ID mappings

The app is an OAuth public client and must not use a client secret. Although IDs and URLs are configuration identifiers rather than bearer credentials, this project's public-documentation policy treats live deployment values as private.

Switching environments clears the current in-memory access token and pending PKCE state, loads only the selected account's OAuth state, and may require a new sign-in. Encrypted tokens and customer IDs must never cross environments.

The desktop callback protocol is registered by `package.json` under `build.protocols`. Any deployment change to the redirect URI must stay synchronized between NetSuite configuration, the active app profile, and the packaged protocol registration.

## Authentication and token storage

The OAuth flow is implemented in `src/main/netsuite/auth/oauthPkceProvider.ts`:

```text
App creates PKCE verifier/challenge/state
    -> default browser opens NetSuite authorization
    -> user selects the approved role and consents
    -> desktop callback returns account/role/user/code/state
    -> main process validates callback identity
    -> main process exchanges the code for tokens
    -> report access is unlocked for this app launch
```

Security rules:

- Access tokens stay in Electron main-process memory.
- Refresh tokens are encrypted with Electron `safeStorage` in `src/main/storage/encryptedTokenStore.ts`.
- Refresh-token keys are namespaced by NetSuite account/environment.
- Rotated one-time-use refresh tokens replace the consumed token immediately.
- The renderer never receives access tokens, refresh tokens, Authorization headers, authorization codes, or PKCE values.
- Tokens must never be stored in `.env`, localStorage, React state persisted to disk, JSON settings, logs, GitHub, or public issue attachments.

Electron stores the encrypted token file under its per-user application-data directory, not in this repository. Uninstall currently preserves application data, so sign out before uninstalling when the saved token must be removed.

Account and role checks are implemented by `oauthAuthorizationValidator.ts`; the launch gate and report-access guard are implemented by `netSuiteConnectionAdapter.ts`.

## NetSuite data flow

```text
React report
    -> typed preload IPC
    -> BacklogService (validation, filtering, paging)
    -> NetSuiteBacklogDataSource / BacklogRepository
    -> authenticated SuiteQL and REST clients
    -> sanitized typed results
    -> renderer
```

Important implementation paths:

| Concern                                                 | Location                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| App startup, dependency composition, cache invalidation | `src/main/index.ts`                                                                                    |
| Typed IPC channels and payloads                         | `src/shared/ipc/channels.ts`, `src/shared/types/backlog.ts`                                            |
| IPC validation/handlers                                 | `src/main/ipc/registerIpcHandlers.ts`                                                                  |
| Renderer bridge                                         | `src/preload/index.ts`                                                                                 |
| Report orchestration and controls                       | `src/renderer/src/app/App.tsx`                                                                         |
| Table, expansion, lazy enrichment, and column resizing  | `src/renderer/src/features/backlog/BacklogTable.tsx`                                                   |
| Headers/status/presentation rules                       | `src/renderer/src/features/backlog/backlogTablePresentation.ts`                                        |
| Backlog filtering/search service                        | `src/main/services/backlogService.ts`                                                                  |
| Sales Order header/line SuiteQL                         | `src/main/netsuite/queries/backlogQuery.ts`                                                            |
| Query validation/escaping helpers                       | `src/main/netsuite/queries/querySafety.ts`                                                             |
| SuiteQL paging/client                                   | `src/main/netsuite/client/suiteQlClient.ts`                                                            |
| Authenticated REST client                               | `src/main/netsuite/client/netsuiteHttpClient.ts`                                                       |
| Sales Order data/enrichment                             | `src/main/netsuite/repositories/backlogRepository.ts`                                                  |
| SO-line to Work Order relationship                      | `src/main/netsuite/workOrders/workOrderRelationshipResolver.ts`                                        |
| Work Order Built REST lookup/cache                      | `src/main/netsuite/workOrders/workOrderBuiltProvider.ts`                                               |
| Painted child Work Order lookup                         | `src/main/netsuite/workOrders/workOrderPaintedProvider.ts`                                             |
| Optional Paint/Fabric details                           | `src/main/netsuite/details/salesOrderDetailProvider.ts`                                                |
| Print data collection                                   | `src/main/services/backlogPrintDataService.ts`                                                         |
| PDF rendering/save flow                                 | `src/main/services/pdfPrintService.ts`, `src/renderer/src/features/backlog/PrintableBacklogReport.tsx` |
| Print-friendly customer labels                          | `src/renderer/src/features/backlog/printBacklogPresentation.ts`                                        |

### Backlog query rules

The verified query factory:

- restricts results to internal IDs configured for the active environment
- retrieves Sales Order headers separately from item lines
- excludes closed item lines, tax lines, and non-item lines
- excludes the non-backlog Sales Order statuses listed earlier
- orders Sales Orders by Created Date ascending
- strictly validates numeric internal-ID lists
- normalizes exact Sales Order and PO searches before building controlled SuiteQL

Do not introduce a generic arbitrary-query or string-interpolation interface. User input must pass its dedicated normalizer and validator before it can affect SuiteQL.

### Work Order enrichment

The existing SO-line-to-Work-Order relationship is resolved in SuiteQL and must remain the authoritative match; Work Orders are not matched by SKU alone. The relationship resolver uses the verified transaction-line link first and a Created From relationship as its fallback.

- **Built:** Once the Work Order internal ID is known, the app reads the native `built` field through the Work Order REST record endpoint. IDs are deduplicated, requests have bounded concurrency, and values are cached.
- **Painted:** For an eligible painted line whose Built value is below quantity, the app finds child Work Orders through the verified transaction-line relationship. If multiple eligible component SKUs begin with `8`, the first matching child is used. Its native Work Order Built value becomes Painted.
- **Optional descriptions:** Paint and Fabric detail lookups run when rows are expanded and do not block the base backlog.

Built and Painted use the same completion colors: zero is red, a positive value below quantity is amber, and a value at or above quantity is green. Work Order statuses have their own status-specific colors in the renderer.

## Connection and diagnostics

The Connection screen contains deployment information and these read-only tools. All requests run in Electron main, not React.

| Tool                 | What it proves or displays                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Test Connection      | Makes a real REST metadata request to prove OAuth and REST Web Services connectivity.                              |
| Test SuiteQL         | Executes a small read-only SuiteQL query and displays sanitized sample results.                                    |
| Resolve Customer IDs | Finds relevant customer candidates and compares them with the configured allowlist. It never writes configuration. |
| Inspect Sales Order  | Runs the known-safe field diagnostic for one strictly normalized Sales Order number.                               |

Diagnostics return typed, sanitized data only. Extend the existing OAuth provider, HTTP/SuiteQL clients, error mapping, IPC channel, preload API, and renderer diagnostic pattern rather than introducing parallel infrastructure.

## Project layout

```text
src/main/       Electron lifecycle, OAuth, IPC, NetSuite clients and services
src/preload/    Narrow typed API exposed to the renderer
src/renderer/   React report, printing view, and Connection/Diagnostics UI
src/shared/     Cross-process types, IPC channels, constants, and pure utilities
tests/          Unit and mocked integration tests; no live NetSuite requests
docs/           Historical architecture, integration, and field-mapping notes
build/          electron-builder resources
out/            Unpackaged build output
release/        Generated Windows installers (ignored by Git)
```

The files under `docs/` include earlier investigation notes and may describe an older report shape or pending work that has since been implemented. Verify them against the current implementation paths listed above before changing a proven query.

## Development

Requirements:

- Windows 10 or newer
- Node.js 22.12.0 or newer
- npm

Install the locked dependencies and start the development build:

```bash
npm ci
npm run dev
```

For local UI development without NetSuite, create an uncommitted `.env` file:

```text
DATA_SOURCE=mock
```

Mock mode is visibly labelled and does not send NetSuite requests. Its fixtures live under `src/main/data/mock/`.

Browser security settings are configured in `src/main/index.ts`: context isolation is enabled, Node integration is disabled, and renderer sandboxing is enabled. Preserve those boundaries.

## Verification and Windows packaging

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run dist:win
```

- `npm run build` creates the unpackaged bundle under `out/`; it does **not** update an installed application.
- `npm run dist:win` creates an x64 NSIS installer under `release/` using the filename pattern `Hauser Backlog Report Setup <version>.exe`.
- `dist:win` does not run lint or tests, so keep the full verification sequence.
- Install the newly generated installer before testing an installed build.
- Tests use mocks and must not require NetSuite credentials or network access.

The Windows CI workflow runs formatting, linting, type checking, tests, an unpackaged build, and unsigned installer generation. It should not publish releases or use live NetSuite credentials.

## Troubleshooting

### The report stays locked after sign-in

- Finish the browser callback; an incomplete or denied flow cannot unlock the report.
- Confirm the active environment and select the exact approved role shown by the app.
- Use **Open NetSuite Again** to restart authorization.
- A `401` normally requires signing in again. A `403` means the approved role may lack required REST, SuiteQL, or record permissions; contact the NetSuite administrator.

### A REST or SuiteQL diagnostic fails

- `404`: verify the environment's SuiteTalk URL and REST Web Services setup.
- `429`: wait, then retry after the NetSuite rate/concurrency limit clears.
- `5xx`: NetSuite returned a service error; retry later and preserve only the sanitized code/message.
- Network/timeout: check connectivity and retry.

Never attach full response bodies or authentication headers to a ticket.

### A customer or order does not appear

- Confirm the Customer filter. Exact SO/PO search results are still restricted to that customer.
- Verify the exact order/PO number and use **Clear** to return to the filtered backlog.
- Closed/non-backlog Sales Order statuses and customers outside the allowlist are intentionally hidden.
- For customer mapping problems, run **Resolve Customer IDs** in the correct environment and compare candidates without publishing the returned values.

### Base rows appear but optional values are blank

Refresh, then expand the Sales Order again. Refresh clears cached Paint/Fabric, Built, and Painted results. An optional lookup failure intentionally does not remove the Sales Order or Work Order mapping.

### PDF generation is slow or no file appears

The PDF collects every page for the selected customer scope and can take time. Wait for the Windows Save dialog, select a writable path, and remember that cancelling the dialog creates no file.

## Rules for future changes

- Keep OAuth, NetSuite HTTP, SuiteQL, Work Order REST, printing, and token access in `src/main`.
- Keep the renderer behind typed preload IPC; never expose Node/Electron internals or tokens directly.
- Preserve the startup account/role gate and environment-specific token isolation.
- Keep all NetSuite operations read-only unless a separately approved design explicitly adds writes.
- Do not replace the verified SO-to-WO relationship with SKU-only matching.
- Validate every user-controlled search value before it reaches SuiteQL.
- Optional enrichment failures must not hide verified base report data.
- Preserve working diagnostics when extending report functionality.
- Never commit or publish live identifiers, OAuth material, customer exports, raw responses, or confidential screenshots.
