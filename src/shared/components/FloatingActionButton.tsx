import { useEffect, useState } from 'react'
import { HiChevronDown, HiOutlinePlus } from 'react-icons/hi'

const formBackdropSelector = [
  '.fp-calendar-form-backdrop',
  '.fp-diary-form-backdrop',
  '.fp-restaurant-form-backdrop',
  '.fp-ledger-entry-backdrop',
  '.fp-ledger-detail-edit-backdrop',
  '.baby-form-dialog-backdrop',
  '.baby-record-form-dialog-backdrop',
  '.fp-trip-form-backdrop',
  '.fp-community-form-backdrop',
].join(', ')

function hasOpenFormDialog() {
  return Boolean(document.querySelector(formBackdropSelector))
}

interface FloatingActionButtonProps {
  ariaLabel: string
  className?: string
  onClick: () => void
}

export function FloatingActionButton({ ariaLabel, className = '', onClick }: FloatingActionButtonProps) {
  const [formDialogOpen, setFormDialogOpen] = useState(hasOpenFormDialog)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const syncFormDialogState = () => setFormDialogOpen(hasOpenFormDialog())
    syncFormDialogState()

    // Do not rely on the mobile WebView's :has() support.  The FAB unmounts
    // while any input form is open, so the software keyboard cannot reposition
    // it behind the dialog.
    const observer = new MutationObserver(syncFormDialogState)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  if (formDialogOpen) return null

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function scrollToBottom() {
    const root = document.documentElement
    window.scrollTo({ top: Math.max(root.scrollHeight, document.body.scrollHeight), behavior: 'smooth' })
  }

  function openForm() {
    setIsOpen(false)
    onClick()
  }

  return (
    <nav className={`fp-floating-quick-nav ${isOpen ? 'open' : ''} ${className}`} aria-label={`${ariaLabel} 빠른 이동`}>
      {isOpen ? (
        <div className="fp-floating-quick-menu">
          <button type="button" aria-label="화면 위로 이동" onClick={scrollToTop}>
            <HiChevronDown className="fp-floating-quick-chevron up" aria-hidden="true" />
          </button>
          <button type="button" aria-label="화면 아래로 이동" onClick={scrollToBottom}>
            <HiChevronDown className="fp-floating-quick-chevron" aria-hidden="true" />
          </button>
          <button className="fp-floating-quick-input" type="button" onClick={openForm}>입력</button>
        </div>
      ) : null}
      <button
        className="fp-floating-action-button"
        type="button"
        aria-label={isOpen ? '빠른 이동 닫기' : ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        {isOpen ? '−' : <HiOutlinePlus aria-hidden="true" />}
      </button>
    </nav>
  )
}
