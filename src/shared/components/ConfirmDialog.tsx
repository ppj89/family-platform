import { HiOutlineX } from 'react-icons/hi'

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  busyLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = '확인',
  cancelLabel = '취소',
  busy = false,
  busyLabel = '처리 중',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fp-confirm-backdrop" role="presentation">
      <section className="fp-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-confirm-title" aria-busy={busy}>
        <header>
          <h2 id="fp-confirm-title">{title}</h2>
          <button type="button" aria-label="닫기" disabled={busy} onClick={onCancel}>
            <HiOutlineX aria-hidden="true" />
          </button>
        </header>
        <p>{body}</p>
        <div className={`fp-confirm-actions${danger ? ' danger' : ''}`}>
          <button className="fp-button fp-button-muted" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button
            className={`fp-button ${danger ? 'fp-button-danger' : 'fp-button-primary'}${busy ? ' fp-button-loading' : ''}`}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
