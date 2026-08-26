# Hauser Backlog Report

Hauser Backlog Report is a read-only Windows desktop application that presents Sales Order backlog data from NetSuite. It has no hosted backend, database, or NetSuite write capability.

This public README deliberately excludes account IDs, client IDs, role IDs, customer names, API URLs, and other deployment-specific values. Keep those values in a private configuration process, not public documentation.

## Tech stack

- Electron and `electron-builder`
- React and TypeScript
- `electron-vite`
- TanStack Table
- Zod
- NetSuite REST Web Services and REST SuiteQL
- Electron `safeStorage`
- Vitest and ESLint

## User workflow

Each normal live-environment launch opens the NetSuite Connection screen and starts browser OAuth sign-in. The user signs in, selects the organization-approved role, and approves access. A valid callback opens the report. A denied request, wrong account, or wrong role leaves the user on the Connection screen with the report locked.

The report provides a connection indicator, customer filter, Sales Order search, Clear, Refresh, paging, loading/empty/error states, horizontal and vertical scrolling, and expandable Work Order details where available. Missing optional values are intentionally blank.

## Authentication and authorization

The app uses OAuth 2.0 Authorization Code Grant with PKCE as a public desktop client.

1. Electron main process creates PKCE verifier, challenge, and state values.
2. It opens account-specific NetSuite OAuth with an interactive login-and-consent prompt.
3. NetSuite returns the browser to the registered desktop callback protocol.
4. Before authorization-code exchange, the app validates callback account, role, and user identifiers against the active profile.
5. Only a valid callback unlocks report IPC requests for that app process.

A saved refresh token alone must not bypass the live startup gate. A wrong role must be rejected before code exchange, so it cannot unlock the report or replace a saved token. Explicit Sign out clears the local token; a denied authorization does not.

The approved role's display name and internal/script IDs are deployment configuration. Do not put them in public source or documentation.

## Credential and data safety

- Access tokens stay in Electron main-process memory only.
- Refresh tokens are encrypted with Electron `safeStorage` using the current Windows user's credentials.
- Refresh-token storage is isolated by NetSuite account/environment; tokens must not cross profiles.
- Refresh tokens are one-time use: consume the old token before refresh and save only the replacement token.
- The renderer must never receive tokens, Authorization headers, PKCE verifiers, or raw full NetSuite response bodies.
- The desktop callback protocol eliminates the need for a local web server.

Never commit credentials, OAuth codes, token data, Authorization headers, PKCE values, raw API responses, customer exports, or deployment identifiers. Do not display them in UI diagnostics, logs, screenshots, `.env` files, JSON settings, localStorage, or public issues.

## Environment profiles

The app supports independent live and sandbox profiles. Each profile needs separate non-secret OAuth/API configuration, customer configuration, role-validation configuration, and encrypted refresh-token namespace.

When switching profiles, clear in-memory access-token and PKCE state, load only the selected profile's OAuth state, preserve the other profile's stored token, and require sign-in if needed. Do not add a client secret: the app is designed as a public client.

## Connection and diagnostics

The Connection screen is separate from the report. Its read-only diagnostics run only in Electron's main process through the existing authenticated NetSuite HTTP and SuiteQL infrastructure.

| Tool | Purpose |
| --- | --- |
| Test Connection | Makes a real REST Web Services metadata request to prove authentication and REST connectivity. |
| Test SuiteQL | Executes a read-only SuiteQL query through the REST SuiteQL endpoint. |
| Resolve Customer IDs | Finds customer candidates without writing configuration. |
| Inspect Sales Order | Runs a read-only diagnostic for a strictly normalized Sales Order number. |

Diagnostics must return typed, sanitized results only. Preserve the existing OAuth provider, HTTP client, SuiteQL client, IPC channels, preload API, and error-handling architecture when extending them.

## Architecture

```text
React renderer
    | typed preload IPC only
    v
Electron main process
    |- connection and environment manager
    |- OAuth PKCE provider and encrypted refresh-token store
    |- authenticated NetSuite HTTP and SuiteQL clients
    |- read-only backlog and Work Order providers
    `- typed, sanitized diagnostic results
    v
NetSuite REST Web Services / REST SuiteQL
```

Repository layout:

```text
src/main/       Electron lifecycle, OAuth, IPC, NetSuite clients and repositories
src/preload/    Narrow typed bridge exposed to the renderer
src/renderer/   React report and Connection/Diagnostics interface
src/shared/     Cross-process types, constants, and pure utilities
tests/          Unit and mocked integration tests; no NetSuite network access
docs/           Architecture and field-mapping notes
build/          electron-builder resources
release/        Generated Windows installers (ignored by Git)
```

Useful maintainer entry points:

- `src/main/netsuite/auth/oauthPkceProvider.ts` — PKCE, callback validation, token exchange, and refresh rotation
- `src/main/netsuite/auth/oauthAuthorizationValidator.ts` — active-profile callback account/role validation
- `src/main/netsuite/config/environmentProfiles.ts` — environment profile configuration location
- `src/main/netsuite/connection/netSuiteConnectionAdapter.ts` — launch gate state and report access guard
- `src/main/netsuite/client/` — authenticated REST and SuiteQL infrastructure
- `src/renderer/src/app/App.tsx` — startup Connection screen and report home screen
- `src/renderer/src/features/connection/` — Connection and diagnostics UI

## Rules for future changes

- Keep NetSuite HTTP, OAuth, SuiteQL, and Work Order calls in `src/main`; never fetch from React.
- Keep NetSuite operations read-only unless a separately approved redesign authorizes writes.
- Do not bypass the startup role gate or replace exact role-ID validation with a display-name-only check.
- Strictly validate and normalize user input before it becomes part of SuiteQL. Do not create generic unsafe query interpolation.
- Preserve working diagnostics when adding report functionality.
- Do not commit real deployment identifiers or configuration to a public repository. Use placeholders or a private configuration source.

## Development

Requirements: Windows 10+, Node.js 22.12.0+, and npm.

```bash
npm install
npm run dev
```

For local development without NetSuite, use mock data:

```text
# .env
DATA_SOURCE=mock
```

Mock mode should be visibly labelled and must not send NetSuite requests.

## Verification and installer

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run dist:win
```

`npm run build` writes only the unpackaged bundle to `out/`; it does **not** update an installed application. Generate and install the newly produced Windows installer to test or distribute changes.

## Continuous integration

The Windows workflow runs formatting, linting, type checking, tests, build, and unsigned installer generation. It should not publish releases or use NetSuite credentials.
