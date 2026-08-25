import type { FormEvent } from 'react'

interface SalesOrderInspectionControlsProps {
  value: string
  validationMessage: string | null
  busy: boolean
  disabled: boolean
  controlId: string
  onChange: (value: string) => void
  onInspect: () => void
}

export function SalesOrderInspectionControls({
  value,
  validationMessage,
  busy,
  disabled,
  controlId,
  onChange,
  onInspect
}: SalesOrderInspectionControlsProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onInspect()
  }

  return (
    <form className="sales-order-inspection-controls" onSubmit={handleSubmit} noValidate>
      <label className="field" htmlFor={`${controlId}-input`}>
        <span>Sales Order</span>
        <input
          id={`${controlId}-input`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter 1234 or SO1234"
          maxLength={40}
          disabled={disabled}
          aria-invalid={Boolean(validationMessage)}
          aria-describedby={validationMessage ? `${controlId}-error` : undefined}
        />
      </label>
      <button className="button button--secondary" type="submit" disabled={disabled || busy}>
        {busy ? 'Inspecting Sales Order…' : 'Inspect Sales Order'}
      </button>
      {validationMessage ? (
        <p className="field-error" id={`${controlId}-error`}>
          {validationMessage}
        </p>
      ) : null}
    </form>
  )
}
