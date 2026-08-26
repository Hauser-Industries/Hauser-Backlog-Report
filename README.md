# Hauser Backlog Report

Hauser Backlog Report is a private, read-only Windows desktop application for reviewing Hauser Company Stores Sales Order backlog in NetSuite Production. It uses Electron, React, TypeScript, NetSuite REST Web Services, and REST SuiteQL. There is no hosted application, custom backend, database, or NetSuite write capability.

## How users use the app

Every normal Production launch opens the NetSuite Connection screen. The app opens the default browser; the user signs in, selects **Hauser Backlog Report API**, and approves access. Approval returns through `hauser-backlog://oauth/callback` and opens the main report. A denial or incorrect role keeps the user on the Connection screen and the report locked.

The report contains:

- a Production/NetSuite indicator and Connection button;
- a six-customer filter, Sales Order search, Clear, and Refresh controls;
- newest Sales Orders first, paging, loading, empty, and error states;
- horizontal and vertical scrolling; and
- expandable Work Order information where available.

The report is read-only. Missing optional data is intentionally shown as blank.

## Report scope

The verified report columns are Customer Name, PO #, Work Order #, Sales Order #, Ship To, Item, Item Description, Paint Name, Fabric Name, Welt Name, Button Name, Sum of Qty., Created Date, Due Date, and WO Status. Ship To currently equals Customer Name. Due Date is `custbody_nscs_duedatebal`. Paint/Fabric/Welt/Button remain blank when no resolved value is available.

Production customers:

1. MAIN WAREHOUSE - HAUSER COMPANY STORES
2. INTERNET - HAUSER COMPANY STORES
3. WATERLOO - HAUSER COMPANY STORES
4. OTTAWA - HAUSER COMPANY STORES
5. LONDON - HAUSER COMPANY STORES
6. BURLINGTON - HAUSER COMPANY STORES

## Production authorization

Production is protected by an interactive, per-process authorization gate. A saved refresh token alone cannot open the report after the app starts.

1. Electron main creates PKCE verifier, challenge, and state values.
2. It opens NetSuite OAuth using `prompt=login consent`.
3. NetSuite returns the browser to `hauser-backlog://oauth/callback`.
4. Before exchanging the code, the app verifies the callback `company`, `role`, and `entity` values.
5. Only a valid callback unlocks report IPC requests for that app process.

Production is pinned to these public identifiers:

| Identifier              | Value                             |
| ----------------------- | --------------------------------- |
| Account ID              | `3850367`                         |
| Required role ID        | `1990`                            |
| Required role script ID | `customrole1990`                  |
| Required role name      | `Hauser Backlog Report API`       |
| Redirect URI            | `hauser-backlog://oauth/callback` |
| OAuth scope             | `rest_webservices`                |

Another account or any role other than `1990` is rejected before token exchange. Therefore a wrong-role attempt cannot replace an encrypted token or unlock the report. Denying consent does not delete an existing token; explicit Sign out does.

NetSuite administrators should assign authorized staff the dedicated **Hauser Backlog Report API** role and maintain its least-privileged OAuth 2.0, REST Web Services, SuiteAnalytics Workbook, and report-data permissions. Do not grant Administrator merely to make the app work.

## Security

- Authorization Code Grant with PKCE is used as a public desktop client.
- No client secret, password, OAuth code, token, or PKCE verifier is bundled or committed.
- Access tokens stay in Electron main-process memory only.
- Refresh tokens are encrypted with Electron `safeStorage` using the current Windows user's credentials.
- Refresh-token storage is namespaced by NetSuite account/environment; Sandbox and Production tokens cannot cross environments.
- Refresh tokens are one-time use: the old token is consumed before refresh and only the returned replacement is persisted.
- The React renderer never receives a token, Authorization header, PKCE verifier, or raw NetSuite response body.
- Windows routes `hauser-backlog://` to `Hauser Backlog Report.exe`; no local web server runs.

Never place tokens, Authorization headers, PKCE values, passwords, or raw full NetSuite API responses in logs, UI, IPC results, screenshots, `.env`, JSON settings, localStorage, or Git.

## Environments

| Environment | Account ID    | Use                                             |
| ----------- | ------------- | ----------------------------------------------- |
| Production  | `3850367`     | Live report; startup account/role gate enforced |
| Sandbox     | `3850367_SB1` | Retained for diagnostics and testing            |

Profiles are in `src/main/netsuite/config/environmentProfiles.ts`. Each holds a non-secret account ID, SuiteTalk URL, public client ID, redirect URI, scope, customer set, and independent encrypted-token namespace. Switching environments clears only volatile access-token/PKCE state; it does not delete the other environment's token. Sandbox is not part of normal Production startup.

## Connection and diagnostics

**Connection** opens Connection/Diagnostics. All diagnostic calls run in Electron's main process using the active profile. They return sanitized typed data only.

| Tool                 | Purpose                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Test Connection      | Real REST call: `GET /services/rest/record/v1/metadata-catalog/customer`, using `Accept: application/schema+json`.            |
| Test SuiteQL         | Read-only customer SuiteQL request through REST SuiteQL.                                                                      |
| Resolve Customer IDs | Finds candidate records for the six configured customers; it does not modify configuration.                                   |
| Inspect Sales Order  | Read-only, strictly normalized `SO<number>` diagnostic. Its compatibility request body contains only `q`, not bound `params`. |

## Architecture

```text
React renderer
    | typed preload IPC only
    v
Electron main process
    |- connection/environment manager
    |- OAuth PKCE and encrypted refresh-token store
    |- NetSuite HTTP and SuiteQL clients
    |- read-only backlog and Work Order providers
    `- typed, sanitized diagnostic results
    v
NetSuite REST Web Services / REST SuiteQL
```

Repository layout:

```text
src/main/       Electron lifecycle, OAuth, IPC, NetSuite clients and repositories
src/preload/    Narrow typed bridge for the renderer
src/renderer/   React report and Connection/Diagnostics interface
src/shared/     Cross-process types, constants, and pure utilities
tests/          Unit and mocked integration tests; no NetSuite network access
docs/           Architecture and field-mapping notes
build/          electron-builder resources
release/        Generated Windows installers (ignored by Git)
```

Important starting points:

- `src/main/netsuite/auth/oauthPkceProvider.ts` — PKCE, callback validation, token exchange, and refresh rotation
- `src/main/netsuite/auth/oauthAuthorizationValidator.ts` — Production callback account/role validation
- `src/main/netsuite/config/environmentProfiles.ts` — profiles, customers, and required Production role
- `src/main/netsuite/connection/netSuiteConnectionAdapter.ts` — launch-gate state and report access guard
- `src/main/netsuite/client/` — authenticated REST and SuiteQL infrastructure
- `src/renderer/src/app/App.tsx` — startup Connection screen and report home screen
- `src/renderer/src/features/connection/` — Connection and diagnostic UI

## Rules for future changes

- Keep NetSuite HTTP, OAuth, SuiteQL, and Work Order calls in `src/main`; never fetch from React.
- Reuse existing OAuth, HTTP, SuiteQL, IPC, preload, and sanitized-error infrastructure. Do not create parallel clients.
- Keep operations read-only unless a separately approved redesign authorizes writes.
- Do not bypass the Production role gate or replace numeric role validation with a display-name-only check.
- Strictly validate and normalize user input before it becomes part of SuiteQL. Do not make generic unsafe query interpolation available.
- Preserve the working Connection, SuiteQL, customer-resolution, and Sales Order diagnostics when changing report behavior.
- Public account/client identifiers may be packaged; credentials never may be.

## Development

Requirements: Windows 10+, Node.js 22.12.0+, and npm.

```bash
npm install
npm run dev
```

Packaged builds default to live mode. Use mock data only for local development:

```text
# .env
DATA_SOURCE=mock
```

Mock mode is visibly labelled and makes no NetSuite requests.

## Verification and installer

Run checks individually:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Build a new x64 Windows NSIS installer:

```bash
npm run dist:win
```

The expected installer is `release/Hauser Backlog Report Setup 1.0.0.exe`.

`npm run build` writes only the unpackaged bundle to `out/`; it does **not** update an installed app. Run `npm run dist:win` and install the newly generated `.exe` to test or distribute changes.

## Continuous integration

`.github/workflows/build-windows.yml` runs Windows formatting, linting, type checking, tests, build, and unsigned installer generation. It does not publish releases or use NetSuite credentials.
