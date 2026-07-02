import { useEffect, useRef, useState } from 'react'

export interface CustomSelectOption {
  label: string
  value: string
}

interface CustomSelectProps {
  label: string
  options: CustomSelectOption[]
  value: string
  required?: boolean
  className?: string
  onChange: (value: string) => void
}

export function CustomSelect({ className = '', label, options, required = false, value, onChange }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLLabelElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: MouseEvent | FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('focusin', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('focusin', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <label className={`fp-field fp-custom-select-field custom-select-field ${open ? 'open' : ''} ${className}`} ref={rootRef}>
      <span>{label}{required ? <em className="fp-required-mark">*</em> : null}</span>
      <div className={`fp-custom-select custom-select${open ? ' open' : ''}`}>
        <button className={`fp-custom-select-trigger custom-select-trigger${open ? ' open' : ''}`} type="button" onClick={() => setOpen((current) => !current)}>
          <span>{selected?.label || '선택'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
        <div className="fp-custom-select-list custom-select-list" hidden={!open}>
          {options.map((option) => (
            <button
              className={option.value === selected?.value ? 'selected' : ''}
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </label>
  )
}
