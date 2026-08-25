import { describe, expect, it } from 'vitest'

import { NETSUITE_FIELD_MAPPING } from '../src/main/netsuite/config/fieldMapping'

describe('NETSUITE_FIELD_MAPPING live evidence', () => {
  it('keeps the verified Hauser Due Date candidate separate from the standard due date', () => {
    expect(NETSUITE_FIELD_MAPPING.dueDate).toEqual({
      status: 'verify',
      suiteQlExpression: 't.custbody_nscs_duedatebal',
      note: 'Hauser field ID is verified; direct SuiteQL value still requires a live test.'
    })
    expect(NETSUITE_FIELD_MAPPING.createdDate.suiteQlExpression).toBe('t.createddate')
  })

  it('uses the verified report quantity rule and excludes retired quantity columns', () => {
    expect(NETSUITE_FIELD_MAPPING.quantity).toMatchObject({
      status: 'verified',
      suiteQlExpression: '-tl.quantity'
    })
    expect(NETSUITE_FIELD_MAPPING).not.toHaveProperty('quantityShipped')
    expect(NETSUITE_FIELD_MAPPING).not.toHaveProperty('quantityRemaining')
  })

  it('records the four verified replacement field IDs and no child-WO mapping', () => {
    expect(NETSUITE_FIELD_MAPPING.paintName.suiteQlExpression).toBe(
      'tl.custcol_nscs_paintreplacementsku'
    )
    expect(NETSUITE_FIELD_MAPPING.fabricName.suiteQlExpression).toBe(
      'tl.custcol_nscs_fabricreplacementsku'
    )
    expect(NETSUITE_FIELD_MAPPING.weltName.suiteQlExpression).toBe(
      'tl.custcol_nscs_weltreplacement'
    )
    expect(NETSUITE_FIELD_MAPPING.buttonName.suiteQlExpression).toBe(
      'tl.custcol_nscs_buttonreplacement'
    )
    expect(NETSUITE_FIELD_MAPPING.topLevelWorkOrderRelationship.suiteQlExpression).toBe(
      'tl.createwo'
    )
    expect(NETSUITE_FIELD_MAPPING).not.toHaveProperty('childWorkOrderRelationship')
  })
})
