import { useState } from 'react'
import './TextTester.css'

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="code-panel">
      <div className="code-toolbar">
        <span>{language || 'code'}</span>
        <button type="button" className="copy-button" onClick={copyCode}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-block">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function MessageContent({ text }) {
  const parts = String(text || '').split(/(```[\w+#.-]*\s*[\s\S]*?```)/g)
  return parts.map((part, index) => {
    const match = part.match(/^```([\w+#.-]*)\s*([\s\S]*?)```$/)
    if (!match) return <span key={index}>{part}</span>
    return <CodeBlock key={index} language={match[1]} code={match[2].trim()} />
  })
}

function cleanNewsSnippet(value) {
  return String(value || '')
    .replace(/!\[[^\]]*\](?:\([^)]*\))?/g, '')
    .replace(/\[([^\]]+)\](?:\([^)]*\))?/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[()[\]]/g, '')
    .replace(/\\+|[#*_`]/g, '')
    .replace(/\b(?:Your briefing|Top stories|FOR SUBSCRIBERS|HOT TOPICS|CNN Headlines|More Top Stories|Developing)\b/gi, '')
    .replace(/\b_chevron_right_\b/gi, '')
    .replace(/\s*[-–—]\s*(?=[A-Z])/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360)
}

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

function ResearchReport({ dossier }) {
  const sources = Array.isArray(dossier.sources) ? dossier.sources : []
  return (
    <section className="research-report" aria-label="Research report">
      <header className="research-header">
        <span className="research-label">WEB RESEARCH</span>
        <h3>{dossier.topic || 'Research report'}</h3>
      </header>
      {dossier.summary && <p className="research-summary">{dossier.summary}</p>}
      {sources.length > 0 && (
        <section className="research-section">
          <h4>Sources</h4>
          <div className="research-sources">
            {sources.map((source, index) => (
              <article className="research-source" key={`${source.url || source.title}-${index}`}>
                <h5>
                  {source.url
                    ? <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>
                    : source.title || `Source ${index + 1}`}
                </h5>
                  {source.summary && <p>{source.summary}</p>}
                  {source.description && <p>{source.description}</p>}
                  {Array.isArray(source.key_points) && source.key_points.length > 0 && (
                    <ul>{source.key_points.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}</ul>
                  )}
                  {Array.isArray(source.findings) && source.findings.length > 0 && (
                    <ul>{source.findings.map((finding, findingIndex) => <li key={findingIndex}>{finding}</li>)}</ul>
                  )}
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

function NoteResult({ result }) {
  return (
    <section className="research-report" aria-label="Saved notes">
      <header className="research-header"><span className="research-label">NOTES</span><h3>{result.summary}</h3></header>
      {result.note && <p className="research-summary">{result.note.text}</p>}
      {Array.isArray(result.notes) && result.notes.length > 0 && (
        <ul>{result.notes.map((note) => <li key={note.id}>{note.text}</li>)}</ul>
      )}
    </section>
  )
}

function NewsResult({ result }) {
  const briefingLines = String(result.summary || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const briefingTitle = briefingLines.find((line) => !/^[*#\d\s.)-]+$/.test(line))
  const briefingItems = briefingLines
    .filter((line) => /^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^\d+[.)]\s+/, '').replace(/\*\*/g, ''))
  return (
    <section className="news-report" aria-label="Current news">
      <header className="research-header"><span className="research-label">CURRENT NEWS</span><h3>Headlines</h3></header>
      <div className="news-briefing">
        {briefingTitle && !/^\*\*News Briefing:\*\*$/i.test(briefingTitle) && <p className="news-intro">{briefingTitle.replace(/\*\*/g, '')}</p>}
        {briefingItems.length > 0
          ? <ol>{briefingItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol>
          : <p>{String(result.summary || '').replace(/\*\*/g, '')}</p>}
      </div>
      {Array.isArray(result.sources) && result.sources.length > 0 && (
        <div className="news-sources">
          {result.sources.map((source) => <article className="research-source" key={source.url}>
            <h5><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h5>
            {cleanNewsSnippet(source.snippet) && <p>{cleanNewsSnippet(source.snippet)}</p>}
          </article>)}
        </div>
      )}
    </section>
  )
}

function JobSearchResults({ result }) {
  const jobs = Array.isArray(result.jobs) ? result.jobs : []
  return (
    <section className="research-report" aria-label="Job search results">
      <header className="research-header">
        <span className="research-label">JOB SEARCH</span>
        <h3>{result.query || 'Current job listings'}</h3>
      </header>
      {jobs.length > 0 && (
        <div className="research-sources">
          {jobs.map((job, index) => (
            <article className="research-source" key={`${job.url || job.title}-${index}`}>
              <h5>
                {job.url
                  ? <a href={job.url} target="_blank" rel="noreferrer">{job.title || job.url}</a>
                  : job.title || `Job ${index + 1}`}
              </h5>
              {(job.company || job.location || job.workMode) && (
                <p>{[job.company, job.location, job.workMode].filter(Boolean).join(' · ')}</p>
              )}
              {job.description && <p>{job.description}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function SpreadsheetAttachment({ spreadsheet }) {
  if (spreadsheet.status === 'pending') {
    return <div className="spreadsheet-card pending">Preparing your spreadsheet preview...</div>
  }
  if (spreadsheet.status === 'failed') {
    return <div className="spreadsheet-card spreadsheet-error">{spreadsheet.error}</div>
  }
  const formats = spreadsheet.formats || ['xlsx', 'csv']
  return (
    <section className="spreadsheet-card" aria-label="Generated spreadsheet">
      <div className="document-header">
        <div>
          <span className="document-label">SPREADSHEET READY</span>
          <h3>{spreadsheet.title}</h3>
        </div>
        <span className="document-status">
          {spreadsheet.flaggedCells > 0 ? `${spreadsheet.flaggedCells} review flags` : 'Preview'}
        </span>
      </div>
      {spreadsheet.html && (
        <iframe
          className="spreadsheet-preview"
          title={`${spreadsheet.title} preview`}
          srcDoc={spreadsheet.html}
          sandbox=""
        />
      )}
      {spreadsheet.flaggedCells > 0 && (
        <p className="spreadsheet-warning">
          {spreadsheet.flaggedCells} numeric values could not be located in the research findings and should be reviewed.
        </p>
      )}
      <div className="document-actions">
        {formats.map((format) => (
          <a
            className={`download-button ${format === 'xlsx' ? 'primary' : ''}`}
            href={`/api/spreadsheets/${spreadsheet.id}/export?format=${format}`}
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

function CalendarAttachment({ calendar }) {
  const events = Array.isArray(calendar?.events) ? calendar.events : []
  function formatDate(value) {
    if (typeof value !== 'string') return { day: '', month: '', weekday: '' }
    const date = new Date(`${value}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return { day: value, month: '', weekday: '' }
    return {
      day: new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' }).format(date),
      month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date).toUpperCase(),
      weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date),
    }
  }
  function formatTime(value) {
    if (typeof value !== 'string' || !value) return ''
    const [hours, minutes] = value.split(':').map(Number)
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
      new Date(Date.UTC(2026, 0, 1, hours, minutes)),
    )
  }
  return (
    <section className="calendar-card" aria-label="Calendar">
      <div className="document-header">
        <div>
          <span className="document-label">CALENDAR</span>
          <h3>{calendar?.action === 'delete' ? 'Calendar updated' : 'Upcoming events'}</h3>
        </div>
        <span className="document-status">{events.length} {events.length === 1 ? 'event' : 'events'}</span>
      </div>
      {events.length > 0 ? (
        <div className="calendar-events">
          {events.map((event) => (
            <article className="calendar-event" key={event.id || `${event.startDate}-${event.title}`}>
              <div className="calendar-date-block" aria-label={event.startDate}>
                <span>{formatDate(event.startDate).month}</span>
                <strong>{formatDate(event.startDate).day}</strong>
              </div>
              <div className="calendar-event-content">
                <p className="calendar-weekday">{formatDate(event.startDate).weekday}</p>
                <h4>{event.title}</h4>
                <p className="calendar-event-time">
                  {event.allDay ? 'All day' : formatTime(event.startTime) || 'Time not set'}
                </p>
              </div>
              {(event.location || event.notes) && (
                <p className="calendar-event-details">
                  {[event.location, event.notes].filter(Boolean).join(' · ')}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="calendar-empty">No upcoming events.</p>
      )}
    </section>
  )
}

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

      let responseAdded = false
      for (let attempt = 0; attempt < 480; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const jobResponse = await fetch(`/api/text-chat/${data.jobId}`)
        const job = await jobResponse.json()
        if (!jobResponse.ok) throw new Error(job.error || 'The text tester could not read the response.')
        if (job.status === 'failed') throw new Error(job.error || 'The text request failed.')
        if (job.status !== 'complete') continue

        const message = {
          role: 'assistant',
          text: job.output
            || job.jobSearch?.summary
            || job.dossier?.summary
            || 'The request completed without a text response.',
          dossier: job.dossier,
          document: job.document,
          spreadsheet: job.spreadsheet,
          calendar: job.calendar,
          jobSearch: job.jobSearch,
          noteResult: job.noteResult,
          news: job.news,
          jobId: data.jobId,
        }
        const documentDone = !job.document
          || job.document.status === 'ready'
          || job.document.status === 'failed'
        const spreadsheetDone = !job.spreadsheet
          || job.spreadsheet.status === 'ready'
          || job.spreadsheet.status === 'failed'

        if (!responseAdded) {
          setMessages((current) => [...current, message])
          responseAdded = true
        } else if (documentDone || spreadsheetDone) {
          setMessages((current) => current.map((currentMessage) => (
            currentMessage.jobId === data.jobId
              ? { ...currentMessage, ...message }
              : currentMessage
          )))
        }

        if (documentDone && spreadsheetDone) return
      }
      throw new Error('The text request or artifact took too long to finish.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The text request failed.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="text-tester-shell">
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
              {!message.news && <div className="assistant-content"><MessageContent text={message.text} /></div>}
              {message.dossier && <ResearchReport dossier={message.dossier} />}
              {message.jobSearch && <JobSearchResults result={message.jobSearch} />}
              {message.noteResult && <NoteResult result={message.noteResult} />}
              {message.news && <NewsResult result={message.news} />}
              {message.document && <DocumentAttachment document={message.document} />}
              {message.spreadsheet && <SpreadsheetAttachment spreadsheet={message.spreadsheet} />}
              {message.calendar && <CalendarAttachment calendar={message.calendar} />}
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
