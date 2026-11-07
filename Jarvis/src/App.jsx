import { useState } from 'react'
import './App.css'

function App() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendQuestion(event) {
    event.preventDefault()
    const trimmedQuestion = question.trim()

    if (!trimmedQuestion || isLoading) return

    setQuestion('')
    setError('')
    setMessages((current) => [...current, { role: 'user', text: trimmedQuestion }])
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedQuestion }),
      })
      const responseText = await response.text()
      let data

      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch {
        throw new Error(
          `The server returned an invalid response${responseText ? `: ${responseText.slice(0, 120)}` : '.'}`,
        )
      }

      if (!response.ok) {
        const errorMessage =
          typeof data.error === 'string' ? data.error : 'The swarm could not answer right now.'
        throw new Error(errorMessage)
      }

      if (data.jobId) {
        await waitForThinker(data.jobId)
      } else {
        throw new Error('The server did not create a chat job.')
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }

    async function waitForThinker(jobId) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        const response = await fetch(`/api/chat/${jobId}`)
        const job = await response.json()

        if (!response.ok) throw new Error(job.error || 'The chat job could not be found.')

        if (job.status === 'complete') {
          setMessages((current) => [...current, { role: 'assistant', text: job.output }])
          return
        }

        if (job.status === 'failed') throw new Error(job.error)
      }

      throw new Error('The slow layer took too long to respond.')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div>
          <p className="eyebrow">SWARMS API TEST</p>
          <h1>Ask the swarm</h1>
        </div>
        <span className="status"><span /> Ready to connect</span>
      </header>

      <section className="chat-card" aria-label="Swarms chat">
        <div className="chat-intro">
          <p className="eyebrow">MULTI-AGENT RESPONSE</p>
          <h2>Send a question to your swarm.</h2>
          <p>Each message is passed to the Swarms API and returned here as a response.</p>
        </div>

        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">✦</span>
              <p>Your swarm&apos;s response will appear here.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`message-row ${message.role}`} key={`${message.role}-${index}`}>
              <span className="message-label">{message.role === 'user' ? 'You' : 'Swarm'}</span>
              <p>{message.text}</p>
            </div>
          ))}
          {isLoading && (
            <div className="message-row assistant">
              <span className="message-label">Swarm</span>
              <p className="loading">Thinking<span>.</span><span>.</span><span>.</span></p>
            </div>
          )}
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}

        <form className="question-form" onSubmit={sendQuestion}>
          <label htmlFor="question">Your question</label>
          <div className="input-row">
            <input
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What would you like to explore?"
              disabled={isLoading}
              maxLength={2000}
            />
            <button type="submit" disabled={!question.trim() || isLoading}>
              {isLoading ? 'Thinking...' : 'Send'}
              {!isLoading && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </form>
      </section>

      <footer>Powered by <strong>Swarms</strong> · API key stays server-side</footer>
    </main>
  )
}

export default App
