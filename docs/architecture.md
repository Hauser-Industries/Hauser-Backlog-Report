# Architecture

## Purpose

Hauser Backlog Report is a private Windows desktop reporting application. It shows the Sales Order backlog for six configured Hauser Company Stores customers and keeps each Sales Order item as the primary row. A row's top-level Work Order can be expanded to inspect the status of related subassembly Work Orders recursively.

The application is intentionally read-only. It has no hosted companion service, database, telemetry pipeline, editing workflow, or automatic updater.

## Recorded assumptions

1. This is a Windows desktop application.
2. There is no hosted backend.
3. The application retrieves report data from NetSuite.
4. The application is read-only.
5. NetSuite API calls occur only in the Electron main process.
6. OAuth 2.0 PKCE Public Client is the default authentication design.
7. Report data is not persistently cached to disk by default.
8. Work Order hierarchy must use verified NetSuite relationships.
9. Paint/Fabric and several report field IDs still require mapping.
10. Mock data is used until NetSuite setup is completed.

## Process boundary

```text
React renderer
    |
    | narrow, typed, validated IPC
    v
Preload bridge
    |
    v
Electron main process
    |-- data-source selection
    |-- NetSuite authentication and token storage
    |-- SuiteQL/REST client and repositories
    |-- response validation and transformation
    |-- Work Order hierarchy resolution
    `-- sanitized diagnostic logging
```

The renderer has `nodeIntegration` disabled and runs with context isolation. It receives only the operations needed by the report and connection interface. It cannot execute arbitrary SQL, fetch arbitrary URLs, invoke shell commands, read arbitrary files, or access credentials. NetSuite endpoints, tokens, account configuration, and raw payloads stay in the main process.

Remote JavaScript is not loaded. Production builds do not automatically open developer tools, and a restrictive Content Security Policy should be maintained for the renderer.

## Data-source boundary

The UI consumes a backlog data-source contract rather than importing a NetSuite client. Two implementations share that contract:

- `MockBacklogDataSource` supplies deterministic development and test records.
- `NetSuiteBacklogDataSource` coordinates authenticated, validated live reads.

Mock mode must exercise the same report components and models as live mode. Switching modes must not introduce a second throwaway user interface. Sensitive settings must not use `VITE_` environment variables because Vite values can be embedded in renderer assets.

## Report loading flow

```text
load configuration
        |
select mock or live source
        |
retrieve backlog rows at the report's verified grain
        |
collect and deduplicate top-level Work Order internal IDs
        |
retrieve Work Order records and relationships separately
        |
validate records and build recursive hierarchies
        |
merge hierarchies into backlog rows by internal ID
        |
return a typed response to the renderer
```

The newest request controls the displayed state. Customer changes, Sales Order searches, and refreshes use cancellation or request identity checks so an older response cannot overwrite a newer result. Refresh bypasses stale hierarchy state, prevents duplicate concurrent refreshes, and updates the visible timestamp.

Short-lived in-memory caching is acceptable for Work Order details, resolved hierarchies, and customer IDs. The complete backlog is not persisted to disk by default.

## Report grain and quantities

A backlog row must preserve all visible business dimensions, including Sales Order, Work Order, Ship To, item, Paint Name, and Fabric Name. Grouping keys are explicit and testable. Separate lines are not combined merely because they share a customer.

Backlog aggregation and Work Order relationship loading are deliberately separate. Joining a Sales Order line directly to several child Work Orders can multiply the line quantity; the application instead aggregates the line once and attaches a hierarchy afterward by internal ID.

Quantity source fields and sign conventions remain pending account verification. Normalization occurs in one transformation layer, supports decimal quantities, and avoids display artifacts. The calculation `ordered - shipped` is not considered authoritative until compared with the existing NetSuite report.

## Work Order hierarchy

`WorkOrderNode` is recursive and uses NetSuite internal IDs as relationship keys. Transaction numbers remain display values, not database-style identifiers.

Hierarchy construction is expected to:

1. index validated Work Orders by internal ID;
2. associate nodes only through a verified NetSuite transaction relationship;
3. build descendants recursively from a requested root;
4. track the active traversal path to stop circular references;
5. deduplicate repeated relationships;
6. handle missing parents and orphaned records without infinite recursion; and
7. preserve unknown status labels exactly as returned.

Matching an item or SKU is never sufficient evidence of a parent/child relationship. The account-specific relationship is the most important unresolved live integration item and remains an explicit TODO.

## NetSuite integration

The intended live strategy uses REST Web Services and SuiteQL. The low-level client is responsible for Bearer authentication, the required `Prefer: transient` header, reusable limit/offset pagination, response validation, timeouts, cancellation, bounded retry behavior, and sanitized diagnostics.

Backlog retrieval follows a narrow repository path. A specific Sales Order search queries that order directly instead of downloading the full backlog. Full backlog queries are limited to the six configured customers, preferably by their internal IDs after those IDs are verified. Batch Work Order loading is preferred; any necessary per-record fallback is concurrency-limited to avoid an N+1 request burst.

HTTP 401, 403, 429, network failures, invalid configuration, and invalid SuiteQL are translated into useful application errors. Retryable 429 and 5xx responses use a bounded delay and honor `Retry-After` when supplied. Authentication failures and invalid queries are not retried indefinitely.

## Authentication and storage

OAuth 2.0 Authorization Code Grant with PKCE is the default design for this distributed desktop client. It uses a cryptographic verifier, an S256 challenge, and a cryptographically random state value. The user's system browser handles sign-in; the application receives the configurable `hauser-backlog://oauth/callback` deep link through Electron protocol and single-instance handling.

Callback processing validates state, expiry, URI shape, and the presence of an authorization code. Temporary verifier/state material is cleared after success or failure. No client secret is bundled because a secret in a desktop executable is recoverable and cannot be treated as confidential.

Access tokens remain in memory where practical. A persisted refresh token is encrypted with Electron `safeStorage` before being passed to the settings store, and token rotation replaces the prior encrypted value. Signing out clears locally held tokens. Tokens, authorization headers, authorization codes, PKCE verifiers, and secrets are excluded from logs.

Authentication is exposed behind an interface so another approved strategy can be added later without coupling it to the HTTP client. Token-based authentication is not implemented unless separately required.

## Validation and diagnostics

External JSON is treated as untrusted. Zod schemas validate API envelopes and mapped records at integration boundaries. Optional values remain optional; missing display values render as blank or an em dash rather than `undefined`, `null`, or `NaN`.

Development diagnostics may record the application version, endpoint category or query identifier, duration, HTTP status, row count, pagination state, retry count, and transformation errors. Logs exclude tokens, headers, secrets, and unnecessary payload or customer data. Raw payload inspection, if introduced for integration work, must remain inaccessible in production.

## Packaging and deployment

electron-vite builds the main process, preload, and renderer into `out/`. electron-builder packages the x64 application as an NSIS installer in `release/`. Installation is per-user by default; code signing may be configured later. The custom OAuth protocol is registered by the packaged application.

GitHub Actions uses a Windows runner and mock-only tests, so CI does not need live NetSuite access or credentials. Installer output is uploaded as a private workflow artifact and is not automatically published as a public release.

## Live integration boundary

Live results are blocked until the values and relationships in `netsuite-integration-todo.md` are confirmed. `netsuite-field-mapping.md` is the source of truth for field readiness. Pending mappings must fail clearly or remain unavailable; they must never be filled with plausible-looking custom field IDs.
