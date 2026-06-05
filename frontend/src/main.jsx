import { createRoot } from 'react-dom/client'
import './index.css'
import App, { ErrorBoundary } from './App.jsx'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
