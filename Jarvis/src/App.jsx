import { useState } from 'react'
import './App.css'

function DocumentAttachment({ document }) {
  if (document.status === 'pending') {
    return <div className="document-card pending">Preparing your document preview...</div>
  }

  if (document.status === 'failed') {
    return <div className="document-card document-error">{document.error}</div>
  }

  return (
    <section className="document-card" aria-label="Generated document">
      <div className="document-header">
        <div>
          <span className="document-label">DOCUMENT READY</span>
          <h3>{document.title}</h3>
        </div>
        <span className="document-status">Preview</span>
      </div>
      {document.html && (
        <iframe
          className="document-preview"
          title={`${document.title} preview`}
          srcDoc={document.html}
          sandbox=""
        />
      )}
      <div className="document-actions">
        {(document.formats || ['html', 'md', 'pdf', 'docx']).map((format) => (
          <a
            className={`download-button ${format === 'pdf' ? 'primary' : ''}`}
            href={`/api/documents/${document.id}/export?format=${format}`}
            download
            key={format}
          >
            Download {format.toUpperCase()}
          </a>
        ))}
      </div>
    </section>
  )
}

function safeWebUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function ResearchReport({ dossier, jobId, document, onCreateDocument }) {
  const sources = Array.isArray(dossier.sources)
    ? dossier.sources.filter((source) => source && typeof source === 'object')
    : []
  const conflicts = Array.isArray(dossier.conflicts)
    ? dossier.conflicts.filter((item) => typeof item === 'string' && item.trim())
    : []
  const gaps = Array.isArray(dossier.gaps)
    ? dossier.gaps.filter((item) => typeof item === 'string' && item.trim())
    : []
  const queries = Array.isArray(dossier.queries)
    ? dossier.queries.filter((item) => typeof item === 'string' && item.trim())
    : []

  return (
    <section className="research-report" aria-label="Research report">
      <header className="research-header">
        <span className="research-label">WEB RESEARCH</span>
        <h3>{typeof dossier.topic === 'string' && dossier.topic ? dossier.topic : 'Research report'}</h3>
      </header>
      {typeof dossier.summary === 'string' && dossier.summary && (
        <p className="research-summary">{dossier.summary}</p>
      )}

      {sources.length > 0 && (
        <section className="research-section">
          <h4>Sources</h4>
          <div className="research-sources">
            {sources.map((source, index) => {
              const url = safeWebUrl(source.url)
              const title = typeof source.title === 'string' && source.title
                ? source.title
                : url || `Source ${index + 1}`
              const keyPoints = Array.isArray(source.key_points)
                ? source.key_points.filter((item) => typeof item === 'string' && item.trim())
                : []
              const quotes = Array.isArray(source.quotes)
                ? source.quotes.filter((item) => typeof item === 'string' && item.trim())
                : []

              return (
                <article className="research-source" key={`${url || title}-${index}`}>
                  <h5>
                    {url
                      ? <a href={url} target="_blank" rel="noreferrer">{title}</a>
                      : title}
                  </h5>
                  {typeof source.published === 'string' && source.published && (
                    <p className="source-date">Published {source.published}</p>
                  )}
                  {keyPoints.length > 0 && (
                    <ul>{keyPoints.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}</ul>
                  )}
                  {quotes.map((quote, quoteIndex) => (
                    <blockquote key={quoteIndex}>{quote}</blockquote>
                  ))}
                  {typeof source.credibility_note === 'string' && source.credibility_note && (
                    <p className="credibility-note">{source.credibility_note}</p>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {conflicts.length > 0 && (
        <section className="research-section">
          <h4>Conflicting information</h4>
          <ul>{conflicts.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
      )}
      {gaps.length > 0 && (
        <section className="research-section">
          <h4>Gaps and limitations</h4>
          <ul>{gaps.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
      )}
      {document?.status !== 'ready' && (
        <button
          className="research-document-button"
          type="button"
          disabled={document?.status === 'pending'}
          onClick={() => onCreateDocument(jobId)}
        >
          {document?.status === 'pending' ? 'Creating document...' : 'Create document from research'}
        </button>
      )}
      {queries.length > 0 && (
        <details className="research-queries">
          <summary>Search queries used</summary>
          <ul>{queries.map((query, index) => <li key={index}>{query}</li>)}</ul>
        </details>
      )}
    </section>
  )
}

function App() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('Thinking')
  const [error, setError] = useState('')

  async function createDocumentFromResearch(jobId) {
    if (isLoading) return

    setError('')
    setIsLoading(true)
    setLoadingText('Preparing the research document')
    setMessages((current) => current.map((message) => (
      message.jobId === jobId ? { ...message, document: { status: 'pending' } } : message
    )))

    try {
      const response = await fetch(`/api/research/${jobId}/document`, { method: 'POST' })
      const responseText = await response.text()
      let data
      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch {
        throw new Error('The server returned an invalid response while creating the document.')
      }
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'The document could not be created.')
      }

      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const jobResponse = await fetch(`/api/chat/${jobId}`)
        const job = await jobResponse.json()
        if (!jobResponse.ok) throw new Error(job.error || 'The research job could not be found.')

        if (job.document?.status === 'ready' || job.document?.status === 'failed') {
          setMessages((current) => current.map((message) => (
            message.jobId === jobId ? { ...message, document: job.document } : message
          )))
          if (job.document.status === 'failed') {
            throw new Error(job.document.error || 'The document could not be created.')
          }
          return
        }
      }

      throw new Error('The document took too long to finish.')
    } catch (requestError) {
      const errorMessage = requestError instanceof Error
        ? requestError.message
        : 'The document could not be created.'
      setMessages((current) => current.map((message) => (
        message.jobId === jobId
          ? { ...message, document: { status: 'failed', error: errorMessage } }
          : message
      )))
    } finally {
      setIsLoading(false)
    }
  }

  async function sendQuestion(event) {
    event.preventDefault()
    const trimmedQuestion = question.trim()

    if (!trimmedQuestion || isLoading) return

    setQuestion('')
    setError('')
    setMessages((current) => [...current, { role: 'user', text: trimmedQuestion }])
    setIsLoading(true)
    setLoadingText('Thinking')

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
        await waitForThinker(data.jobId, data.mode)
      } else {
        throw new Error('The server did not create a chat job.')
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }

    async function waitForThinker(jobId, mode) {
      let responseAdded = false
      const researching = mode === 'research' || mode === 'research_document'
      const maxAttempts = researching ? 480 : 120
      const pollInterval = researching ? 500 : 250
      if (researching) setLoadingText('Searching the web')

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
        const response = await fetch(`/api/chat/${jobId}`)
        const job = await response.json()

        if (!response.ok) throw new Error(job.error || 'The chat job could not be found.')

        if (job.status === 'complete') {
          if (job.dossier) {
            if (!responseAdded) {
              setMessages((current) => [...current, {
                role: 'assistant',
                text: job.dossier.summary || 'Research complete.',
                research: job.dossier,
                document: job.document,
                jobId,
              }])
              responseAdded = true
            } else if (job.document?.status === 'ready' || job.document?.status === 'failed') {
              setMessages((current) => current.map((message) => (
                message.jobId === jobId ? { ...message, document: job.document } : message
              )))
            }
            if (!job.document || job.document.status === 'ready' || job.document.status === 'failed') return
            setLoadingText('Turning the research into a document')
            continue
          }

          if (!responseAdded) {
            setMessages((current) => [
              ...current,
              { role: 'assistant', text: job.output, document: job.document, jobId },
            ])
            responseAdded = true
          } else if (job.document?.status === 'ready' || job.document?.status === 'failed') {
            setMessages((current) => current.map((message) => (
              message.jobId === jobId
                ? { ...message, document: job.document }
                : message
            )))
          }

          if (!job.document || job.document.status === 'ready' || job.document.status === 'failed') return
        }

        if (job.status === 'researching') setLoadingText('Searching and reading sources')
        if (job.status === 'failed') throw new Error(job.error)
      }

      throw new Error(researching ? 'The research took too long to finish.' : 'The slow layer took too long to respond.')
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
          <p>Ask a question or request web research. Research answers include the sources and findings.</p>
        </div>

        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">✦</span>
              <p>Your swarm&apos;s response will appear here.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div
              className={`message-row ${message.role}${message.research ? ' research-message' : ''}`}
              key={`${message.role}-${index}`}
            >
              <span className="message-label">
                {message.role === 'user' ? 'You' : message.research ? 'Research' : 'Swarm'}
              </span>
              {message.research
                ? (
                  <>
                    <ResearchReport
                      dossier={message.research}
                      jobId={message.jobId}
                      document={message.document}
                      onCreateDocument={createDocumentFromResearch}
                    />
                    {message.document && <DocumentAttachment document={message.document} />}
                  </>
                )
                : <p>{message.text}</p>}
              {!message.research && message.document && <DocumentAttachment document={message.document} />}
            </div>
          ))}
          {isLoading && (
            <div className="message-row assistant">
              <span className="message-label">Swarm</span>
              <p className="loading">{loadingText}<span>.</span><span>.</span><span>.</span></p>
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
              {isLoading ? 'Working...' : 'Send'}
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
