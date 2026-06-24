interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fp-confirm-backdrop" role="presentation">
      <section className="fp-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-confirm-title">
        <header>
          <h2 id="fp-confirm-title">{title}</h2>
          <button type="button" aria-label="닫기" onClick={onCancel}>x</button>
        </header>
        <p>{body}</p>
        <div className="fp-confirm-actions">
          <button className="fp-button fp-button-muted" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className={`fp-button ${danger ? 'fp-button-danger' : 'fp-button-primary'}`} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
