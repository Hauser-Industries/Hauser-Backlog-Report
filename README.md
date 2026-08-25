# Hauser Backlog Report

## Application Purpose

Hauser Backlog Report is a private, read-only Windows desktop application for reviewing Sales Order backlog for six Hauser Company Stores customers. A Sales Order item line remains the report row, with an optional directly referenced top-level Work Order number and status. The active report does not traverse child Work Orders.

The application is built with Electron, React, TypeScript, electron-vite, TanStack Table, and Zod. It runs locally as an installed desktop application and does not require a hosted website, custom backend, cloud database, or continuously running web server.

## Current scope

The installed application currently starts with live connection and field-mapping diagnostics. An explicit mock-mode development override exercises the six configured Hauser Company Stores customers, the flat 15-column table, Sales Order search, filtering, refresh, sorting, and pagination.

Live NetSuite support is integration-ready but the final production backlog query remains blocked until replacement-name precedence and the runtime representation of the top-level `createwo` field are verified. Unknown values are surfaced by diagnostics rather than guessed.

## Architecture and security

- NetSuite authentication and requests belong exclusively to the Electron main process.
- The renderer has no Node.js integration and communicates through a deliberately small typed preload API.
- OAuth is designed for Authorization Code Grant with PKCE as a public desktop client; a confidential client secret is not bundled.
- Access tokens remain only in main-process memory. Refresh tokens are encrypted with Electron `safeStorage` and written as binary ciphertext under the current Windows user's application-data directory—never to JSON settings or renderer storage.
- A refresh token is durably consumed before use. NetSuite's replacement refresh token is required and atomically becomes the only saved token, preventing reuse of a one-time Public Client refresh token.
- The Sales Order field-mapping diagnostic currently returns only raw replacement and `createwo` values. It performs no secondary Item or Work Order lookup and never infers a Work Order by matching SKU.
- Version 1 is read-only and does not create or update NetSuite records.

See [Architecture](docs/architecture.md), [NetSuite field mapping](docs/netsuite-field-mapping.md), and [NetSuite integration TODOs](docs/netsuite-integration-todo.md) for details.

## Requirements

- Windows 10 or later for the packaged desktop application
- Node.js 22.12.0 or later for development
- npm

## Development

Install dependencies and start the Electron development process:

```bash
npm install
npm run dev
```

Electron 42 and newer download the local development runtime on first launch; the `dev` script performs that official on-demand install automatically.

Installed builds and development sessions default to the report home screen. Authenticated Production sessions load the verified live Sales Order columns; Connection opens diagnostics separately. To use fixtures during development, copy `.env.example` to `.env`; the application will visibly report `Mock Data`, so samples cannot be mistaken for NetSuite results.

## Mock Mode

Copy `.env.example` to `.env` if local overrides are needed and retain:

```text
DATA_SOURCE=mock
```

Mock mode requires no NetSuite credentials and is the supported path for local development and automated tests. Mock records cover all six allowed customers, decimal quantities, top-level Work Order statuses, and rows without Work Orders.

## Live Mode

The Electron main process bundles independent Sandbox and Production profiles containing only the non-secret account ID, SuiteTalk URL, public client ID, redirect URI, and scope. The redirect URI is `hauser-backlog://oauth/callback` and the scope is `rest_webservices` for both profiles.

No client secret is bundled. Do not place access tokens, refresh tokens, private keys, or a client secret in `.env`. The live startup screen makes no backlog request; it is intentionally limited to Sign In, callback/token exchange, connection testing, and Sign Out until every pending mapping in `docs/netsuite-field-mapping.md` has been verified.

`Test Connection` is a real main-process REST Web Services probe. It obtains the current access token through the OAuth provider and requests `GET /services/rest/record/v1/metadata-catalog/customer` with `Accept: application/schema+json`. Only HTTP 200 produces `NetSuite REST connection successful.` The renderer receives a narrow typed result containing the outcome, HTTP status, sanitized message, and connection status—never the access token, Authorization header, or NetSuite response body.

This repository intentionally does not include a NetSuite administrator setup tutorial.

## Tests

Run the automated test suite once:

```bash
npm test
```

For watch-mode unit testing:

```bash
npm run test:watch
```

Tests run entirely with local fixtures and do not require a NetSuite account or network access.

## Lint / Type Check

Run the commands independently when diagnosing a failure:

```bash
npm run lint
npm run format:check
npm run typecheck
```

For automatic formatting:

```bash
npm run format
```

## Production Build

Compile and bundle the Electron main process, preload, and renderer:

```bash
npm run build
```

This script runs TypeScript checking first and writes the unpackaged application bundle to `out/`.

## Windows Installer

Build the x64 NSIS installer on Windows:

```bash
npm run dist:win
```

The script rebuilds the application and writes installer artifacts to `release/`. With the current package name and version, the expected installer is:

```text
release/Hauser Backlog Report Setup 1.0.0.exe
```

The installer is per-user by default and does not require administrator access for a normal installation. Development artifacts are unsigned; code signing can be added later without changing the application architecture. See `build/README.md` before replacing the placeholder icon.

## Repository layout

```text
.github/workflows/       Windows validation and installer workflow
build/                  electron-builder resources and icon placeholder
docs/                   Architecture and NetSuite integration records
src/main/               Electron lifecycle, IPC, and NetSuite-facing code
src/preload/            Narrow renderer bridge
src/renderer/           React report interface
src/shared/             Cross-process types, constants, and pure utilities
tests/                  Unit and mocked integration tests
out/                    Generated Electron bundle (ignored)
release/                Generated Windows installer (ignored)
```

## Continuous integration

`.github/workflows/build-windows.yml` runs on a Windows GitHub-hosted runner. It installs dependencies with `npm ci`, checks formatting, linting, types, and tests, builds the application, creates the unsigned NSIS installer, and uploads the `.exe` as a workflow artifact. It does not publish a GitHub Release and does not require NetSuite credentials.

## NetSuite readiness

Implemented software boundaries may be exercised with mocks. The following remain external prerequisites for trustworthy live reporting:

- NetSuite-side OAuth Public Client, consent, role, and permission verification;
- live confirmation of replacement-field raw/display values and Item name precedence;
- live proof that `transactionLine.createwo` is a top-level Work Order reference;
- final reconciliation of the flat 15-column output; and
- comparison and sign-off against the existing NetSuite report.

The complete checklist is maintained in `docs/netsuite-integration-todo.md`.
