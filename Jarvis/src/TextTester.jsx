import { useState } from 'react'
import './App.css'

function TextTester() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendQuestion(event) {
    event.preventDefault()
    const text = question.trim()
    if (!text || isLoading) return

    setQuestion('')
    setError('')
    setMessages((current) => [...current, { role: 'user', text }])
    setIsLoading(true)

    try {
      const response = await fetch('/api/text-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The text tester could not start the request.')

      for (let attempt = 0; attempt < 480; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const jobResponse = await fetch(`/api/text-chat/${data.jobId}`)
        const job = await jobResponse.json()
        if (!jobResponse.ok) throw new Error(job.error || 'The text tester could not read the response.')
        if (job.status === 'failed') throw new Error(job.error || 'The text request failed.')
        if (job.status !== 'complete') continue

        setMessages((current) => [...current, {
          role: 'assistant',
          text: job.output || job.dossier?.summary || 'The request completed without a text response.',
          dossier: job.dossier,
          document: job.document,
          spreadsheet: job.spreadsheet,
        }])
        return
      }
      throw new Error('The text request took too long to finish.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The text request failed.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">T</div>
        <div>
          <p className="eyebrow">TEXT-ONLY TESTER</p>
          <h1>Jarvis text laboratory</h1>
        </div>
        <span className="status"><span /> No voice services</span>
      </header>

      <section className="chat-card" aria-label="Text-only Jarvis tester">
        <div className="chat-intro">
          <p className="eyebrow">SEPARATE TEST ENDPOINT</p>
          <h2>Test the swarm without ElevenLabs.</h2>
          <p>This tester uses text input and text output only. It does not call speech-to-text or text-to-speech.</p>
        </div>
        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">✦</span>
              <p>Text responses will appear here.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`message-row ${message.role}`} key={`${message.role}-${index}`}>
              <span className="message-label">{message.role === 'user' ? 'You' : 'Jarvis'}</span>
              <p className="assistant-content">{message.text}</p>
              {message.dossier && (
                <section className="research-report">
                  <h3>{message.dossier.topic || 'Research report'}</h3>
                  <p>{message.dossier.summary}</p>
                  <ul>
                    {(message.dossier.sources || []).map((source, sourceIndex) => (
                      <li key={`${source.url || source.title}-${sourceIndex}`}>
                        <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {message.document?.status === 'ready' && (
                <div className="document-card">
                  <strong>DOCUMENT READY: {message.document.title}</strong>
                  <div className="document-actions">
                    {(message.document.formats || ['docx']).map((format) => (
                      <a className="download-button primary" href={`/api/documents/${message.document.id}/export?format=${format}`} download key={format}>
                        Download {format.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {message.spreadsheet?.status === 'ready' && (
                <div className="spreadsheet-card">
                  <strong>SPREADSHEET READY: {message.spreadsheet.title}</strong>
                  <div className="document-actions">
                    {(message.spreadsheet.formats || ['xlsx', 'csv']).map((format) => (
                      <a className="download-button primary" href={`/api/spreadsheets/${message.spreadsheet.id}/export?format=${format}`} download key={format}>
                        Download {format.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="message-row assistant">
              <span className="message-label">Jarvis</span>
              <p className="loading">Working<span>.</span><span>.</span><span>.</span></p>
            </div>
          )}
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <form className="question-form" onSubmit={sendQuestion}>
          <label htmlFor="text-tester-question">Text request</label>
          <div className="input-row">
            <input id="text-tester-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask Jarvis anything..." disabled={isLoading} />
            <button type="submit" disabled={!question.trim() || isLoading}>{isLoading ? 'Working...' : 'Send'}<span aria-hidden="true">→</span></button>
          </div>
        </form>
      </section>
      <footer>Text-only tester · ElevenLabs is not used</footer>
    </main>
  )
}

export default TextTester
