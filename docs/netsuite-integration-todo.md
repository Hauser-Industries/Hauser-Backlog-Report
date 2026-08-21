# NetSuite Integration TODO

This is a checklist of information and verification still required for live NetSuite reporting. It is not a NetSuite administrator setup guide. Values must be supplied or confirmed through the Hauser account; none should be fabricated for development.

## Account and OAuth configuration

- [ ] NetSuite production Account ID
- [ ] NetSuite account-specific SuiteTalk domain
- [ ] OAuth Client ID
- [ ] Final OAuth redirect URI
- [ ] Confirm OAuth Public Client configuration
- [ ] Confirm Authorization Code Grant with PKCE support for the integration
- [ ] Confirm `rest_webservices` scope
- [ ] Confirm integration role
- [ ] Confirm required read-only permissions
- [ ] Confirm the authorization and token endpoint URLs for the account
- [ ] Confirm the packaged custom URI callback behavior on each supported Windows version
- [ ] Confirm sign-out expectations and whether NetSuite token revocation will be used

The desktop Public Client design does not use a bundled client secret. Access tokens, refresh tokens, authorization codes, PKCE verifier values, and authorization headers must not be supplied through Git-tracked files.

## Allowed customers

- [ ] Resolve internal ID for `MAIN WAREHOUSE - HAUSER COMPANY STORES`
- [ ] Resolve internal ID for `INTERNET - HAUSER COMPANY STORES`
- [ ] Resolve internal ID for `WATERLOO - HAUSER COMPANY STORES`
- [ ] Resolve internal ID for `OTTAWA - HAUSER COMPANY STORES`
- [ ] Resolve internal ID for `LONDON - HAUSER COMPANY STORES`
- [ ] Resolve internal ID for `BURLINGTON - HAUSER COMPANY STORES`
- [ ] Confirm whether names differ between UI display values and query values

## Backlog and report fields

- [ ] Verify PO # source field
- [ ] Verify Ship To source field
- [ ] Confirm header-level versus line-level Ship To precedence
- [ ] Verify Item and Item Description sources
- [ ] Verify Paint Name custom field ID/source
- [ ] Verify Fabric Name custom field ID/source
- [ ] Verify quantity source
- [ ] Verify quantity shipped source
- [ ] Verify quantity remaining source or calculation
- [ ] Verify quantity signs, units, decimal precision, and return behavior
- [ ] Verify Created Date source and semantics
- [ ] Verify Due Date source and semantics
- [ ] Confirm date-only versus timestamp behavior for each date field
- [ ] Define the exact report grouping grain across Sales Order, line, Work Order, Ship To, item, paint, and fabric
- [ ] Confirm backlog inclusion rules for remaining quantity, cancelled orders, closed lines, and non-item lines
- [ ] Confirm the direct-query behavior for an exact Sales Order search
- [ ] Confirm how a Sales Order outside the six configured customers is detected

## Work Order relationships and status

- [ ] Verify top-level Sales Order line-to-Work Order association
- [ ] Verify child/related Work Order relationship
- [ ] Identify the actual transaction relationship source in the Records Catalog/API
- [ ] Confirm recursive relationship behavior beyond one child level
- [ ] Confirm handling of deleted, inaccessible, or missing parent Work Orders
- [ ] Verify Work Order status field and authoritative display value
- [ ] Determine whether status code is useful in addition to the display label
- [ ] Verify optional Work Order quantity, completed quantity, and remaining quantity fields
- [ ] Verify optional Work Order Created Date and Due Date fields
- [ ] Confirm that batch relationship/status retrieval is available and define any REST-record fallback

The parent/child relationship is a critical blocker. Work Orders must never be attached by matching item or SKU.

## API behavior and operational limits

- [ ] Verify SuiteQL availability for the integration role
- [ ] Validate the required `Prefer: transient` request behavior
- [ ] Confirm practical SuiteQL page size and pagination response shape
- [ ] Confirm account concurrency limits and rate-limit response headers
- [ ] Confirm `Retry-After` behavior for retryable responses
- [ ] Measure normal backlog and Work Order query durations
- [ ] Confirm whether any necessary field requires a REST record request instead of SuiteQL
- [ ] Review diagnostics to ensure no tokens, Authorization headers, or unnecessary payload data are logged

## Reconciliation and acceptance

- [ ] Create representative raw-response fixtures with sensitive data removed
- [ ] Validate raw responses against the application schemas
- [ ] Compare customer filtering with the existing NetSuite report
- [ ] Compare exact Sales Order search results with the existing NetSuite report
- [ ] Compare quantity totals with the existing NetSuite report
- [ ] Confirm child Work Orders do not multiply parent Sales Order quantities
- [ ] Compare Created Date and Due Date values with the existing NetSuite report
- [ ] Compare top-level and nested Work Order statuses with NetSuite
- [ ] Test no-Work-Order, no-child, duplicate-link, missing-parent, orphan, and circular-link cases
- [ ] Confirm Refresh retrieves current Work Order statuses
- [ ] Confirm application access remains read-only
- [ ] Obtain business-owner sign-off on the final live report output
