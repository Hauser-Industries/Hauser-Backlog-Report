# Hauser Backlog Report

## Application Purpose

Hauser Backlog Report is a private, read-only Windows desktop application for reviewing Sales Order backlog and its related manufacturing Work Orders. Its distinguishing feature is an expandable Work Order hierarchy: a Sales Order line remains the main report row while the top-level Work Order and recursively related subassembly Work Orders can be inspected together.

The application is built with Electron, React, TypeScript, electron-vite, TanStack Table, and Zod. It runs locally as an installed desktop application and does not require a hosted website, custom backend, cloud database, or continuously running web server.

## Current scope

The first milestone runs against realistic mock data and exercises the same renderer and data-source boundary intended for live data. It covers the six configured Hauser Company Stores customers, the 15-column backlog table, Sales Order search, customer filtering, refresh, sorting, pagination, and recursively expandable Work Order details.

Live NetSuite support is integration-ready but is not production-ready until the account configuration, report field mappings, backlog rules, and actual Work Order transaction relationships are verified. No unknown NetSuite internal IDs or custom field IDs are guessed in this repository.

## Architecture and security

- NetSuite authentication and requests belong exclusively to the Electron main process.
- The renderer has no Node.js integration and communicates through a deliberately small typed preload API.
- OAuth is designed for Authorization Code Grant with PKCE as a public desktop client; a confidential client secret is not bundled.
- Persistent refresh tokens, when enabled, are encrypted with Electron `safeStorage`. Access tokens remain in memory where practical.
- Backlog rows and Work Order relationships are retrieved independently and merged by internal ID to avoid quantity inflation from one-to-many joins.
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

The default development configuration is mock mode. The application should visibly report `Mock Data`, so sample records cannot be mistaken for live NetSuite results.

## Mock Mode

Copy `.env.example` to `.env` if local overrides are needed and retain:

```text
DATA_SOURCE=mock
```

Mock mode requires no NetSuite credentials and is the supported path for local development and automated tests. Mock records cover all six allowed customers, multiple shipment states and Work Order statuses, rows without Work Orders, child Work Orders, and a nested hierarchy.

## Live Mode

Live mode is reserved for integration work after the required account values and field mappings have been confirmed. Its non-secret configuration shape is documented in `.env.example`:

```text
DATA_SOURCE=live
NETSUITE_ACCOUNT_ID=
NETSUITE_ACCOUNT_DOMAIN=
NETSUITE_CLIENT_ID=
NETSUITE_REDIRECT_URI=hauser-backlog://oauth/callback
NETSUITE_SCOPE=rest_webservices
```

Do not place access tokens, refresh tokens, private keys, or a client secret in `.env`. Sensitive tokens must never enter the renderer or Git history. Live backlog results must not be treated as authoritative until every pending mapping in `docs/netsuite-field-mapping.md` has been compared with the existing NetSuite backlog report.

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

- account-specific OAuth/Public Client configuration;
- the six customer internal IDs;
- verified Sales Order, line, quantity, date, Paint Name, Fabric Name, and Ship To fields;
- the verified top-level Sales Order line-to-Work Order association;
- the verified Work Order parent/child transaction relationship; and
- comparison and sign-off against the existing NetSuite report.

The complete checklist is maintained in `docs/netsuite-integration-todo.md`.
