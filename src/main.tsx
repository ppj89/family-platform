import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

declare global {
  interface Window {
    FAMILY_PLATFORM_API_BASE_URL?: string
  }
}

window.FAMILY_PLATFORM_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const root = document.getElementById('root')

if (!root) {
  throw new Error('React root element was not found.')
}

createRoot(root).render(<App />)
