import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TextTester from './TextTester.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {window.location.pathname === '/text-tester' ? <TextTester /> : <App />}
  </StrictMode>,
)
