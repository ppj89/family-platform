import { useEffect } from 'react'

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

  return (
    <div className="fp-toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
