# NetSuite Field Mapping

This document tracks the account-specific mapping between the Hauser Backlog Report model and NetSuite. It is intentionally incomplete. A field is not production-ready until it has been checked against the NetSuite Records Catalog or API response and compared with the existing backlog report.

No custom field IDs, internal customer IDs, or Work Order relationship fields are assumed here.

## Status definitions

- **Pending** — no verified source has been supplied.
- **Verify** — the general record concept is known, but its exact field, join, display value, or report semantics still requires confirmation.
- **Verified** — confirmed in the Hauser account and reconciled with the existing report. No entries are marked Verified yet.
- **Critical** — blocks a core correctness requirement and must be resolved before live reporting is accepted.

## Mapping register

| Application field                | Model value                                   | NetSuite source                                                                     | Status       | Verification note                                                                                                     |
| -------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Customer internal ID             | `customerInternalId`                          | Customer/entity internal ID associated with the Sales Order                         | Verify       | Resolve the six configured customers; prefer this ID for live filtering.                                              |
| Customer Name                    | `customerName`                                | Customer/entity display value                                                       | Pending      | Must match the existing report's customer dimension.                                                                  |
| PO #                             | `poNumber`                                    | TBD                                                                                 | Pending      | Confirm the customer purchase-order/reference source; do not assume a field ID.                                       |
| Work Order internal ID           | `workOrderInternalId`                         | Work Order transaction internal ID                                                  | Verify       | Preserve separately from the displayed transaction number.                                                            |
| Work Order #                     | `workOrderNumber`                             | Work Order transaction display number                                               | Verify       | Confirm the displayed value used by the existing report.                                                              |
| Sales Order internal ID          | `salesOrderInternalId`                        | Sales Order transaction internal ID                                                 | Verify       | Use for joins and stable identity where available.                                                                    |
| Sales Order #                    | `salesOrderNumber`                            | Sales Order transaction display number                                              | Verify       | Confirm whether any account-specific prefix behavior applies.                                                         |
| Ship To                          | `shipTo`                                      | TBD                                                                                 | Pending      | Determine header versus line-level source; a valid line-specific destination should take precedence when appropriate. |
| Item internal ID                 | `itemInternalId`                              | Transaction-line item internal ID                                                   | Verify       | Preserve separately from item display text.                                                                           |
| Item                             | `item`                                        | Transaction-line item display value                                                 | Verify       | Confirm matrix/configuration behavior.                                                                                |
| Item Description                 | `itemDescription`                             | TBD                                                                                 | Pending      | Confirm whether the report uses the transaction-line or item-record description.                                      |
| Paint Name                       | `paintName`                                   | Custom field, option, item field, or custom record TBD                              | Pending      | Do not assume a `custcol_*` field.                                                                                    |
| Fabric Name                      | `fabricName`                                  | Custom field, option, item field, or custom record TBD                              | Pending      | Do not assume a `custcol_*` field.                                                                                    |
| Sum of Qty.                      | `quantity`                                    | TBD                                                                                 | Pending      | Confirm source, units, signs, aggregation grain, and decimal behavior.                                                |
| Sum of Qty. Ship                 | `quantityShipped`                             | TBD                                                                                 | Pending      | Confirm source, units, signs, and treatment of fulfillments/returns.                                                  |
| Sum of Qty. Rmn                  | `quantityRemaining`                           | Calculated or source field TBD                                                      | Pending      | Do not assume ordered minus shipped until reconciliation is complete.                                                 |
| Created Date                     | `createdDate`                                 | TBD                                                                                 | Pending      | Determine whether this is created timestamp, transaction date, or another report field.                               |
| Due Date                         | `dueDate`                                     | TBD                                                                                 | Pending      | Determine whether this is accounting due date, expected ship date, production date, or another field.                 |
| WO status code                   | `workOrderStatus.code` / `statusCode`         | Work Order status code TBD                                                          | Verify       | Code is optional and must not control the displayed label.                                                            |
| WO Status                        | `workOrderStatus.label` / `statusLabel`       | Work Order status display value                                                     | Verify       | Preserve the authoritative display text, including unknown future statuses.                                           |
| Top-level Work Order association | Sales Order line to `workOrderInternalId`     | Actual NetSuite transaction relationship TBD                                        | **Critical** | Must identify the Work Order created for the specific Sales Order item; SKU matching is prohibited.                   |
| Child Work Order relationship    | `parentWorkOrderInternalId` / hierarchy edges | Actual NetSuite transaction link or account-specific manufacturing relationship TBD | **Critical** | Must support recursive descendants and must not be inferred by item/SKU.                                              |
| Root Work Order ID               | `rootWorkOrderInternalId`                     | Derived after verified relationship traversal                                       | Pending      | Derive in application code once relationship edges are trusted.                                                       |
| WO quantity                      | `WorkOrderNode.quantity`                      | TBD                                                                                 | Pending      | Optional detail field; avoid extra requests unless needed.                                                            |
| WO quantity completed            | `WorkOrderNode.quantityCompleted`             | TBD                                                                                 | Pending      | Optional detail field.                                                                                                |
| WO quantity remaining            | `WorkOrderNode.quantityRemaining`             | Calculated or source field TBD                                                      | Pending      | Confirm sign and source semantics independently of Sales Order quantities.                                            |
| WO Created Date                  | `WorkOrderNode.createdDate`                   | TBD                                                                                 | Pending      | Optional detail field; preserve date-only semantics when applicable.                                                  |
| WO Due Date                      | `WorkOrderNode.dueDate`                       | TBD                                                                                 | Pending      | Optional detail field; confirm production meaning.                                                                    |

## Mapping rules

1. Preserve internal IDs separately from display values.
2. Keep account-specific fields in one main-process configuration module rather than scattering string IDs through queries or UI code.
3. Validate raw API values before transforming them into shared application models.
4. Define the report grouping dimensions explicitly before applying any sum.
5. Aggregate Sales Order lines before loading Work Order relationships; never sum a result set expanded by child Work Order joins.
6. Keep date-only values as date-only values so local timezone conversion cannot shift the displayed day.
7. Retain the exact NetSuite Work Order status label. Status normalization is allowed only for visual styling.
8. Treat missing optional fields as missing, not as the strings `undefined`, `null`, or `NaN`.
9. Change a status to Verified only after account evidence and comparison with the existing NetSuite report are recorded.

## Relationship decision record

The Work Order hierarchy resolver accepts a root Work Order internal ID and returns a recursive model. The resolver's backing query remains pending until an actual NetSuite relationship is identified in the Hauser account. Candidate concepts such as parent, created-from, related transaction, or transaction-link data are investigation areas only; none is asserted as the correct field in this document.
