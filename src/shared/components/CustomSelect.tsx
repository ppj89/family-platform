import { useEffect, useRef, useState } from 'react'

export interface CustomSelectOption {
  label: string
  value: string
}

interface CustomSelectProps {
  label?: string
  ariaLabel?: string
  options: CustomSelectOption[]
  value: string
  required?: boolean
  className?: string
  onChange: (value: string) => void
}

export function CustomSelect({ className = '', label = '', ariaLabel, options, required = false, value, onChange }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  // Inside a scrollable dialog body, the list opening downward can run
  // under the dialog's sticky action footer (or off the bottom of the
  // screen) with no room to show. Flip it to open upward, and cap its
  // height to whatever space is actually available, whenever there isn't
  // enough room below the trigger.
  const [dropDirection, setDropDirection] = useState<{ upward: boolean; maxHeight: number } | null>(null)
  const rootRef = useRef<HTMLLabelElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
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

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setDropDirection(null)
      return
    }
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const wantedHeight = Math.min(options.length * 38 + 12, 260)
    const spaceBelow = viewportHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const upward = spaceBelow < wantedHeight && spaceAbove > spaceBelow
    setDropDirection({ upward, maxHeight: Math.max(120, Math.min(wantedHeight, upward ? spaceAbove : spaceBelow)) })
  }, [open, options.length])

  return (
    <label className={`fp-field fp-custom-select-field custom-select-field ${open ? 'open' : ''} ${className}`} ref={rootRef}>
      {label ? <span>{label}{required ? <em className="fp-required-mark">*</em> : null}</span> : null}
      <div className={`fp-custom-select custom-select${open ? ' open' : ''}`}>
        <button ref={triggerRef} className={`fp-custom-select-trigger custom-select-trigger${open ? ' open' : ''}`} type="button" aria-label={ariaLabel || label || '선택'} onClick={() => setOpen((current) => !current)}>
          <span>{selected?.label || '선택'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
        <div
          className="fp-custom-select-list custom-select-list"
          hidden={!open}
          style={
            dropDirection
              ? {
                  top: dropDirection.upward ? 'auto' : 'calc(100% + 6px)',
                  bottom: dropDirection.upward ? 'calc(100% + 6px)' : 'auto',
                  maxHeight: dropDirection.maxHeight,
                  overflowY: 'auto',
                }
              : undefined
          }
        >
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
