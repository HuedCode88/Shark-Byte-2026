import { useEffect, useRef, useState } from 'react'
import { useSpeech } from './hooks/useSpeech'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import SpeechWave from './components/SpeechWave'
import './App.css'

function MessageContent({ text }) {
  const parts = text.split(/(```[\w+#.-]*\s*[\s\S]*?```)/g)
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

function safeWebUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function ResearchReport({ dossier, jobId, document, spreadsheet, onCreateDocument, onCreateSpreadsheet }) {
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
              const findings = Array.isArray(source.findings)
                ? source.findings.filter((item) => typeof item === 'string' && item.trim())
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
                  {typeof source.summary === 'string' && source.summary && <p>{source.summary}</p>}
                  {typeof source.description === 'string' && source.description && <p>{source.description}</p>}
                  {keyPoints.length > 0 && (
                    <ul>{keyPoints.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}</ul>
                  )}
                  {findings.length > 0 && (
                    <ul>{findings.map((finding, findingIndex) => <li key={findingIndex}>{finding}</li>)}</ul>
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
      {spreadsheet?.status !== 'ready' && (
        <button
          className="research-document-button"
          type="button"
          disabled={spreadsheet?.status === 'pending'}
          onClick={() => onCreateSpreadsheet(jobId)}
        >
          {spreadsheet?.status === 'pending'
            ? 'Creating spreadsheet...'
            : 'Create spreadsheet from research'}
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

function JobSearchResults({ result }) {
  const jobs = Array.isArray(result.jobs)
    ? result.jobs.filter((job) => job && typeof job === 'object')
    : []

  return (
    <section className="job-search-results" aria-label="Job search results">
      <header className="job-search-header">
        <span className="research-label">JOB SEARCH</span>
        <h3>{result.summary || `${jobs.length} matching listings`}</h3>
        {result.query && <p>Search: {result.query}</p>}
      </header>
      {result.fallback && (
        <p className="job-fallback-note" role="status">
          These are search-result links. Some sites blocked automated detail checks, so confirm the role details on the source page.
        </p>
      )}
      {jobs.length > 0 ? (
        <div className="job-listings">
          {jobs.map((job, index) => {
            const url = safeWebUrl(job.url)
            if (!url || typeof job.title !== 'string') return null
            const details = [job.company, job.location, job.workMode, job.employmentType, job.salary, job.postedDate]
              .filter((value) => typeof value === 'string' && value.trim())

            return (
              <article className="job-result" key={`${url}-${index}`}>
                <h4>{job.title}</h4>
                {details.length > 0 && <p className="job-details">{details.join(' · ')}</p>}
                {typeof job.description === 'string' && job.description && (
                  <p className="job-description">{job.description}</p>
                )}
                <a className="job-apply-link" href={url} target="_blank" rel="noreferrer">
                  View listing <span aria-hidden="true">↗</span>
                </a>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="job-empty-state">No verified listings were found. Try adding a role, company, or location.</p>
      )}
      {result.searchedAt && <p className="job-searched-at">Searched {new Date(result.searchedAt).toLocaleString()}</p>}
    </section>
  )
}

function NoteResult({ result }) {
  return <section className="research-report" aria-label="Saved notes">
    <header className="research-header"><span className="research-label">NOTES</span><h3>{result.summary}</h3></header>
    {result.note && <p className="research-summary">{result.note.text}</p>}
    {Array.isArray(result.notes) && <ul>{result.notes.map((note) => <li key={note.id}>{note.text}</li>)}</ul>}
  </section>
}

function NewsResult({ result }) {
  const briefingLines = String(result.summary || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const briefingItems = briefingLines.filter((line) => /^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^\d+[.)]\s+/, '').replace(/\*\*/g, ''))
  return <section className="news-report" aria-label="Current news">
    <header className="research-header"><span className="research-label">CURRENT NEWS</span><h3>Headlines</h3></header>
    <div className="news-briefing">
      {briefingItems.length > 0
        ? <ol>{briefingItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol>
        : <p>{String(result.summary || '').replace(/\*\*/g, '')}</p>}
    </div>
    {Array.isArray(result.sources) && result.sources.length > 0 && (
      <div className="news-sources">
        {result.sources.map((source) => (
          <article className="research-source" key={source.url}>
            <h5><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h5>
            {cleanNewsSnippet(source.snippet) && <p>{cleanNewsSnippet(source.snippet)}</p>}
          </article>
        ))}
      </div>
    )}
  </section>
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('Thinking')
  const [error, setError] = useState('')
  const [conversationActive, setConversationActive] = useState(false)
  const conversationActiveRef = useRef(false)
  const resumeTimeoutRef = useRef(null)
  const { speak, stop: stopSpeaking, speaking, levelRef } = useSpeech()
  const {
    start,
    stop,
    listening,
    transcribing,
    finalText,
    error: recognitionError,
  } = useSpeechRecognition({
    levelRef,
    onError: (message) => {
      const recoverable = message === 'Can you repeat that please?'
      if (recoverable) {
        setError(message)
        if (conversationActiveRef.current) resumeConversation()
        return
      }
      conversationActiveRef.current = false
      setConversationActive(false)
    },
    onFinish: (text) => {
      void sendQuestion(text)
    },
  })

  useEffect(() => () => window.clearTimeout(resumeTimeoutRef.current), [])

  async function beginListening() {
    await start()
    if (!conversationActiveRef.current) stop()
  }

  function resumeConversation() {
    window.clearTimeout(resumeTimeoutRef.current)
    resumeTimeoutRef.current = window.setTimeout(() => {
      if (conversationActiveRef.current) void beginListening()
    }, 350)
  }

  function handleMicClick() {
    if (conversationActiveRef.current) {
      conversationActiveRef.current = false
      setConversationActive(false)
      window.clearTimeout(resumeTimeoutRef.current)
      stopSpeaking()
      if (listening) stop()
      return
    }
    conversationActiveRef.current = true
    setConversationActive(true)
    stopSpeaking()
    setError('')
    void beginListening()
  }

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

  async function createSpreadsheetFromResearch(jobId) {
    if (isLoading) return
    setError('')
    setIsLoading(true)
    setLoadingText('Preparing the research spreadsheet')
    setMessages((current) => current.map((message) => (
      message.jobId === jobId ? { ...message, spreadsheet: { status: 'pending' } } : message
    )))
    try {
      const response = await fetch(`/api/research/${jobId}/spreadsheet`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The spreadsheet could not be created.')
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const jobResponse = await fetch(`/api/chat/${jobId}`)
        const job = await jobResponse.json()
        if (!jobResponse.ok) throw new Error(job.error || 'The research job could not be found.')
        if (job.spreadsheet?.status === 'ready' || job.spreadsheet?.status === 'failed') {
          setMessages((current) => current.map((message) => (
            message.jobId === jobId ? { ...message, spreadsheet: job.spreadsheet } : message
          )))
          if (job.spreadsheet.status === 'failed') {
            throw new Error(job.spreadsheet.error || 'The spreadsheet could not be created.')
          }
          return
        }
      }
      throw new Error('The spreadsheet took too long to finish.')
    } catch (requestError) {
      const errorMessage = requestError instanceof Error
        ? requestError.message
        : 'The spreadsheet could not be created.'
      setMessages((current) => current.map((message) => (
        message.jobId === jobId
          ? { ...message, spreadsheet: { status: 'failed', error: errorMessage } }
          : message
      )))
    } finally {
      setIsLoading(false)
    }
  }

  async function sendQuestion(prompt) {
    const trimmedQuestion = prompt.trim()

    if (!trimmedQuestion || isLoading) return

    setError('')
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
      if (conversationActiveRef.current) resumeConversation()
    }

    async function waitForThinker(jobId, mode) {
      let responseAdded = false
      const researching = mode === 'research' || mode === 'research_document' || mode === 'research_spreadsheet'
      const jobSearching = mode === 'job_search'
      const maxAttempts = researching || jobSearching ? 480 : 120
      const pollInterval = researching || jobSearching ? 500 : 150
      if (researching) setLoadingText('Searching the web')
      if (jobSearching) setLoadingText('Searching current job listings')

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
        const response = await fetch(`/api/chat/${jobId}`)
        const job = await response.json()

        if (!response.ok) throw new Error(job.error || 'The chat job could not be found.')

        if (job.status === 'complete') {
          if (job.jobSearch) {
            if (!responseAdded) {
              setMessages((current) => [...current, {
                role: 'assistant',
                text: job.jobSearch.summary,
                jobSearch: job.jobSearch,
                noteResult: job.noteResult,
                news: job.news,
                calendar: job.calendar,
                jobId,
              }])
              responseAdded = true
              if (job.jobSearch.summary) await speak(job.jobSearch.summary)
            }
            return
          }

          if (job.dossier) {
            if (!responseAdded) {
              setMessages((current) => [...current, {
                role: 'assistant',
                text: job.dossier.summary || 'Research complete.',
                research: job.dossier,
                document: job.document,
                spreadsheet: job.spreadsheet?.status === 'ready' || job.spreadsheet?.status === 'failed'
                  ? job.spreadsheet
                  : undefined,
                jobId,
              }])
              responseAdded = true
              if (job.dossier.summary) await speak(job.dossier.summary)
            } else if (
              (job.document?.status === 'ready' || job.document?.status === 'failed')
              || (job.spreadsheet?.status === 'ready' || job.spreadsheet?.status === 'failed')
            ) {
              setMessages((current) => current.map((message) => (
                message.jobId === jobId
                  ? { ...message, document: job.document, spreadsheet: job.spreadsheet }
                  : message
              )))
            }
            const documentDone = !job.document || job.document.status === 'ready' || job.document.status === 'failed'
            const spreadsheetDone = !job.spreadsheet
              || job.spreadsheet.status === 'ready'
              || job.spreadsheet.status === 'failed'
            if (documentDone && spreadsheetDone) return
            setLoadingText(job.spreadsheet ? 'Turning the research into a spreadsheet' : 'Turning the research into a document')
            continue
          }

          if (!responseAdded) {
            setMessages((current) => [
              ...current,
              {
                role: 'assistant',
                text: job.output,
                calendar: job.calendar,
                noteResult: job.noteResult,
                news: job.news,
                document: job.document,
                spreadsheet: job.spreadsheet?.status === 'ready' || job.spreadsheet?.status === 'failed'
                  ? job.spreadsheet
                  : undefined,
                jobId,
              },
            ])
            responseAdded = true
            if (job.output) await speak(job.output)
          } else if (
            (job.document?.status === 'ready' || job.document?.status === 'failed')
            || (job.spreadsheet?.status === 'ready' || job.spreadsheet?.status === 'failed')
          ) {
            setMessages((current) => current.map((message) => (
              message.jobId === jobId
                ? { ...message, document: job.document, spreadsheet: job.spreadsheet }
                : message
            )))
          }

          const documentDone = !job.document || job.document.status === 'ready' || job.document.status === 'failed'
          const spreadsheetDone = !job.spreadsheet
            || job.spreadsheet.status === 'ready'
            || job.spreadsheet.status === 'failed'
          if (documentDone && spreadsheetDone) return
        }

        if (job.status === 'researching') setLoadingText('Searching and reading sources')
        if (job.status === 'searching_jobs') setLoadingText('Searching current job listings')
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
          <p className="eyebrow">VOICE ASSISTANT</p>
          <h1>Jarvis</h1>
        </div>
        <span className={`status${conversationActive ? ' active' : ''}`}>
          <span /> {listening
            ? 'Listening'
            : transcribing
              ? 'Transcribing'
              : speaking
                ? 'Speaking'
                : isLoading
                  ? loadingText
                  : conversationActive ? 'Your turn' : 'Ready'}
        </span>
      </header>

      <section className="chat-card" aria-label="Jarvis responses">
        <div className="chat-intro">
          <p className="eyebrow">YOUR ASSISTANT</p>
          <h2>What can I help with?</h2>
          <p>Responses, research, and documents will appear here.</p>
        </div>

        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">✦</span>
              <p>Your Jarvis response will appear here.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div
              className={`message-row ${message.role}${message.research ? ' research-message' : ''}`}
              key={`${message.role}-${index}`}
            >
              <span className="message-label">
                {message.jobSearch ? 'Jobs' : message.news ? 'News' : message.noteResult ? 'Notes' : message.research ? 'Research' : 'Jarvis'}
              </span>
              {message.jobSearch
                ? <JobSearchResults result={message.jobSearch} />
                : message.noteResult
                ? <NoteResult result={message.noteResult} />
                : message.news
                ? <NewsResult result={message.news} />
                : message.research
                ? (
                  <>
                    {!message.spreadsheet && (
                      <ResearchReport
                        dossier={message.research}
                        jobId={message.jobId}
                        document={message.document}
                        spreadsheet={message.spreadsheet}
                        onCreateDocument={createDocumentFromResearch}
                        onCreateSpreadsheet={createSpreadsheetFromResearch}
                      />
                    )}
                    {message.document && <DocumentAttachment document={message.document} />}
                    {message.spreadsheet && <SpreadsheetAttachment spreadsheet={message.spreadsheet} />}
                  </>
                )
                : (
                  <>
                    {!message.news && (
                      <p className={message.role === 'assistant' ? 'assistant-content' : undefined}>
                        <MessageContent text={message.text} />
                      </p>
                    )}
                    {message.spreadsheet && <SpreadsheetAttachment spreadsheet={message.spreadsheet} />}
                  </>
                )}
              {!message.research && message.document && <DocumentAttachment document={message.document} />}
              {!message.research && message.calendar && <CalendarAttachment calendar={message.calendar} />}
            </div>
          ))}
          {isLoading && (
            <div className="message-row assistant">
              <span className="message-label">Jarvis</span>
              <p className="loading">{loadingText}<span>.</span><span>.</span><span>.</span></p>
            </div>
          )}
        </div>

        {(error || recognitionError) && (
          <p className="error-message" role="alert">{error || recognitionError}</p>
        )}

        <section className="voice-console" aria-label="Voice controls">
          <div className="speech-wave">
            <SpeechWave
              active={speaking || listening}
              levelRef={levelRef}
              width={560}
              height={92}
              color="#58d8e6"
            />
          </div>
          <div className="voice-actions">
            <button
              className={`mic-button${conversationActive ? ' listening' : ''}`}
              type="button"
              onClick={handleMicClick}
            >
              {conversationActive ? 'End conversation' : 'Start conversation'}
            </button>
            {speaking && (
              <button className="stop-speaking-button" type="button" onClick={stopSpeaking}>
                Stop voice
              </button>
            )}
          </div>
          <p className="voice-status" aria-live="polite">
            {listening
              ? 'Listening'
              : transcribing
                ? 'Transcribing'
                : speaking
                  ? 'Speaking'
                  : isLoading
                    ? loadingText
                    : conversationActive
                      ? 'Ready for you'
                    : 'Ready'}
          </p>
          {finalText && <p className="transcript-note">Heard: {finalText}</p>}
        </section>
      </section>

      <footer>Powered by <strong>Swarms</strong> · API key stays server-side</footer>
    </main>
  )
}