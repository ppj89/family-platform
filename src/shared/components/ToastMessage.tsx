import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ToastMessageProps {
  message: string
  onClose: () => void
}

export function ToastMessage({ message, onClose }: ToastMessageProps) {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onClose, 2400)
    return () => window.clearTimeout(timer)
  }, [message, onClose])

  if (!message) return null

  return createPortal(
    <div className="fp-toast" role="status" aria-live="polite">
      {message}
    </div>,
    document.body,
  )
}
