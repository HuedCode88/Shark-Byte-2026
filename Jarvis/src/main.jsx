import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const root = createRoot(document.getElementById('root'))
const page = window.location.pathname === '/text-tester'
  ? import('./TextTester.jsx').then(({ default: TextTester }) => <TextTester />)
  : Promise.resolve(<App />)

page.then((content) => root.render(<StrictMode>{content}</StrictMode>))
