# NetSuite Integration TODO

This checklist contains only remaining live verification and production-report work. It does not include retired shipped/remaining quantity columns or child Work Order traversal.

## Account and authentication

- [x] Package independent Sandbox and Production account, SuiteTalk URL, client ID, redirect URI, and scope profiles.
- [x] Isolate encrypted refresh tokens and in-memory OAuth state by account/environment.
- [x] Register `hauser-backlog://oauth/callback` and keep tokens in the Electron main process.
- [x] Live-test REST Web Services and basic SuiteQL diagnostics.
- [x] Resolve the six Production customer internal IDs while excluding candidates `226` and `5601`.
- [ ] Confirm the final read-only Production role permissions used by the installed build.

## Exact Sales Order diagnostic

- [x] Validate and normalize Sales Order numbers locally before SuiteQL interpolation.
- [x] Send the compatibility request body with `q` only and no bound `params`.
- [x] Verify `transaction.tranid`, `transaction.entity`, `transaction.otherrefnum`, `transaction.createddate`, line Item fields, and the quantity sign behavior.
- [x] Restore the last known-good SO10144 inspection query without the five experimental fields.
- [ ] Resume isolated Paint, Fabric, Welt, Button, and `createwo` investigation after the demo.

## Replacement names

- [x] Record the four line custom field IDs without using them in the demo query.
- [ ] After the demo, isolate each field and design any replacement Item lookup separately.
- [ ] Compare representative live rows with the current Hauser report and choose the correct Paint/Fabric/Welt/Button name precedence.
- [ ] Confirm expected behavior for null fields and a different replacement Item on each Sales Order line.

## Top-level Work Order

- [x] Record `transactionLine.createwo` as the candidate source.
- [x] Keep `createwo` out of the demo query and perform no live Work Order lookup.
- [x] Use the explicitly labelled demo hierarchy provider behind a replaceable interface.
- [x] Prohibit Item/SKU matching and child Work Order traversal in the active flow.
- [ ] Prove whether live `createwo` is a numeric reference in Production.
- [ ] Compare top-level Work Order number and status with NetSuite, including no-WO and unknown-status cases.

## Final backlog query and acceptance

- [ ] Implement the production backlog query only after the remaining diagnostic evidence is captured.
- [ ] Keep the final report at the documented 15-column, Sales-Order-line grain.
- [ ] Use Customer Name as Ship To and `-transactionLine.quantity` as report quantity.
- [ ] Confirm inclusion rules for cancelled orders, closed lines, non-item lines, and exact Sales Order search.
- [ ] Reconcile totals, dates, replacement names, and top-level WO values with the existing report.
- [ ] Confirm all NetSuite operations remain read-only and obtain business-owner sign-off.
