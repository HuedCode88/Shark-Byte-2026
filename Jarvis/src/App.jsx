import { useEffect, useState } from 'react'
import { WindowManager } from '../client/WindowManager'
import { useVoiceSession } from '../client/useVoiceSession'
import { useUiStore } from '../client/uiStore'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [messages, setMessages] = useState([])
  const { sendTranscript, isThinking, answer, error } = useVoiceSession()
  const windows = useUiStore((state) => state.windows)
  const undo = useUiStore((state) => state.undo)
  const setTheme = useUiStore((state) => state.applyCommands)

  useEffect(() => {
    if (answer) setMessages((current) => [...current, { role: 'assistant', text: answer }])
  }, [answer])

  const submit = (event) => {
    event.preventDefault()
    if (!transcript.trim() || isThinking) return
    const nextMessages = [...messages, { role: 'user', text: transcript.trim() }]
    setMessages(nextMessages)
    sendTranscript(transcript, undefined, nextMessages)
    setTranscript('')
  }

  return <main className="app-shell">
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">S</div>
      <div><p className="eyebrow">GENERATIVE UI / VOICE SESSION</p><h1>Jarvis workspace</h1></div>
      <div className="header-actions">
        <button className="secondary-button" onClick={undo} disabled={!windows.length}>Undo</button>
      </div>
    </header>
    <section className="workspace-card">
      <div className="conversation" aria-live="polite">
        {messages.length === 0 && <p className="conversation-empty">Your conversation with Jarvis will appear here.</p>}
        {messages.map((message, index) => <div className={`conversation-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'user' ? 'You' : 'Jarvis'}</span><p>{message.text}</p></div>)}
      </div>
      <WindowManager />
      {isThinking && <div className="thinking-window" data-ui-id="thinking"><span className="pulse" /> Thinking with the swarm…</div>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <form className="question-form" onSubmit={submit}>
        <label htmlFor="transcript">Talk to Jarvis</label>
        <div className="input-row">
          <input id="transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Compare two options, summarize this, show a chart…" maxLength={2000} disabled={isThinking} />
          <button type="submit" disabled={!transcript.trim() || isThinking}>{isThinking ? 'Working…' : 'Compose'} <span aria-hidden="true">→</span></button>
        </div>
      </form>
    </section>
    <footer><button className="text-button" onClick={() => setTheme([{ op: 'setTheme', tokens: { accent: '#9de6ff' } }])}>Change accent</button> · API key stays server-side</footer>
  </main>
}

export default App
