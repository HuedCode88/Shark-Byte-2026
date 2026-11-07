import { useState } from 'react'
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

export default function App() {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('Thinking')
  const [error, setError] = useState('')
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
    onFinish: (text) => {
      void sendQuestion(text)
    },
  })

  function handleMicClick() {
    if (listening) {
      stop()
      return
    }
    stopSpeaking()
    setError('')
    start()
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
              if (job.dossier.summary) speak(job.dossier.summary)
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
            if (job.output) speak(job.output)
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
          <p className="eyebrow">VOICE ASSISTANT</p>
          <h1>Jarvis</h1>
        </div>
        <span className={`status${listening ? ' active' : ''}`}>
          <span /> {listening ? 'Listening' : speaking ? 'Speaking' : 'Ready'}
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
                {message.research ? 'Research' : 'Jarvis'}
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
                : (
                  <>
                    <p className={message.role === 'assistant' ? 'assistant-content' : undefined}>
                      <MessageContent text={message.text} />
                    </p>
                  </>
                )}
              {!message.research && message.document && <DocumentAttachment document={message.document} />}
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
              color="#83b84e"
            />
          </div>
          <div className="voice-actions">
            <button
              className={`mic-button${listening ? ' listening' : ''}`}
              type="button"
              onClick={handleMicClick}
              disabled={isLoading || transcribing}
            >
              {listening ? 'Finish recording' : transcribing ? 'Transcribing...' : 'Start listening'}
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
                : isLoading
                  ? loadingText
                  : speaking
                    ? 'Speaking'
                    : 'Ready'}
          </p>
          {finalText && <p className="transcript-note">Heard: {finalText}</p>}
        </section>
      </section>

      <footer>Powered by <strong>Swarms</strong> · API key stays server-side</footer>
    </main>
  )
}
