# Architecture

## Purpose and active report contract

Hauser Backlog Report is a private, read-only Windows desktop application for six configured Hauser Company Stores customers. Its report keeps one Sales Order item line as the primary grain and presents exactly these 15 columns:

1. Customer Name
2. PO #
3. Work Order #
4. Sales Order #
5. Ship To
6. Item
7. Item Description
8. Paint Name
9. Fabric Name
10. Welt Name
11. Button Name
12. Sum of Qty.
13. Created Date
14. Due Date
15. WO Status

Ship To intentionally repeats Customer Name. Report quantity is the sign-inverted Sales Order line quantity. Shipped/remaining quantities and child Work Order hierarchy are not part of the active report model, query path, or UI.

## Process boundary

```text
React renderer
    |
    | narrow typed IPC (sanitized results only)
    v
Preload bridge
    |
    v
Electron main process
    |-- environment-aware OAuth and encrypted token storage
    |-- authenticated REST/SuiteQL client
    |-- diagnostic and eventual backlog queries
    |-- response validation and report transformation
    `-- sanitized logging
```

The renderer cannot execute arbitrary SQL, request arbitrary URLs, access Node.js, or receive OAuth credentials. The main process owns NetSuite configuration, tokens, queries, response validation, and read-only HTTP access.

## Current field-mapping flow

The exact Sales Order diagnostic uses the last known-good SO10144 transaction-line query. The four replacement custom fields and `createwo` are excluded because adding them caused a Production HTTP 500. It performs no secondary Item or Work Order query.

```text
validated Sales Order number
        |
read Sales Order transaction lines
        |
validate the known-good row fields
        |
return typed sanitized diagnostic result
```

The eventual production backlog query remains blocked on live diagnostic evidence for replacement-name precedence and the runtime representation of `createwo`. Mock mode exercises the same flat report model and 15-column renderer.

## Quantities and grain

Live REST SuiteQL inspection showed `transactionLine.quantity` as negative numeric strings for the tested Sales Order. The active normalization rule is:

```text
report quantity = -transactionLine.quantity
```

The raw value and raw scalar type remain visible in the diagnostic. No shipped or remaining quantity calculation participates in the report. Grouping must preserve Sales Order line, Customer, top-level Work Order, Item, and the four replacement dimensions.

## Authentication and environment isolation

OAuth uses Authorization Code Grant with PKCE and the registered `hauser-backlog://oauth/callback` protocol. Access tokens stay only in main-process memory. Refresh tokens are encrypted with Electron `safeStorage`, stored as binary ciphertext, and namespaced by NetSuite account/environment. Switching environments clears access-token and pending PKCE state without deleting the other profile's encrypted refresh token.

Sandbox and Production profiles have independent account IDs, SuiteTalk URLs, and public client IDs. The connected environment is explicit in typed state and visibly labelled in the UI. There is no bundled client secret.

NetSuite Public Client refresh tokens are treated as one-time-use credentials: the prior encrypted token is consumed before refresh, and a replacement refresh token must be encrypted and saved before its access token is published.

## Validation, errors, and logging

Zod validates external envelopes and rows. Strict query helpers accept only application-controlled Sales Order numbers or numeric NetSuite internal IDs. HTTP and SuiteQL errors are mapped into typed, sanitized renderer results, including allowlisted NetSuite error code/message diagnostics for field mapping. Tokens, authorization headers, PKCE material, and raw response bodies do not cross IPC or enter logs.

## Packaging

`electron-vite` builds the main, preload, and renderer bundles into `out/`. `electron-builder` creates the Windows x64 NSIS installer under `release/` and registers the OAuth protocol for the packaged executable. A source build does not update an already installed application; the new installer must be generated and run separately.
