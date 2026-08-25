# NetSuite Field Mapping

This register records the demo-ready 15-column report contract. All NetSuite reads run in the Electron main process.

| Report column    | NetSuite source / demo rule     | Status        |
| ---------------- | ------------------------------- | ------------- |
| Customer Name    | `BUILTIN.DF(t.entity)`          | Verified      |
| PO #             | `t.otherrefnum`                 | Verify        |
| Work Order #     | Clearly labelled demo hierarchy | Demo fallback |
| Sales Order #    | `t.tranid`                      | Verified      |
| Ship To          | Customer Name                   | Verified      |
| Item             | `BUILTIN.DF(tl.item)`           | Verified      |
| Item Description | `tl.memo`                       | Verify        |
| Paint Name       | Unresolved; display em dash     | Deferred      |
| Fabric Name      | Unresolved; display em dash     | Deferred      |
| Welt Name        | Unresolved; display em dash     | Deferred      |
| Button Name      | Unresolved; display em dash     | Deferred      |
| Sum of Qty.      | `-tl.quantity`                  | Verified      |
| Created Date     | `t.createddate`                 | Verify        |
| Due Date         | `t.custbody_nscs_duedatebal`    | Verify        |
| WO Status        | Clearly labelled demo hierarchy | Demo fallback |

## Demo safety rules

1. The five fields that caused the Production HTTP 500 are excluded from both the main report query and Inspect Sales Order.
2. No replacement Item or live Work Order lookup is issued.
3. No Work Order is inferred by matching Item or SKU.
4. The hierarchy provider is replaceable, but this build uses packaged mock hierarchy data and labels it `Demo`/`Demo hierarchy` in the UI.
5. Ship To repeats Customer Name, and unresolved replacement names render as an em dash.
6. Shipped/remaining quantities and live child-Work-Order traversal are out of scope.
