import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import {
  DOC_SPEC_PROMPT,
  EXPORT_FORMATS,
  exportDocument,
  getDocument,
  isDocumentContextFollowUp,
  isDocumentContinuation,
  parseDocSpec,
  renderHtml,
  saveDocument,
  wantsDocumentEdit,
  wantsDocument,
} from './documents.js'

const port = Number(process.env.PORT || 3001)
const swarmsUrl = 'https://api.swarms.world/v1/swarm/completions'
const jobs = new Map()
const memories = []
let latestDocumentId = null
const maxMemoryEntries = 20
const maxJobEntries = 100
const fallbackModels = {
  thinker: 'gpt-4o',
  memory: 'gpt-4o-mini',
  guardian: 'gpt-4o',
  delivery: 'gpt-4o-mini',
  initiator: 'gpt-4o',
  docWriter: 'gpt-4o',
  docStructure: 'gpt-4.1',
  orchestrator: 'gpt-4o-mini',
}

function configuredModel(name, fallback) {
  const model = process.env[name]?.trim()
  if (!model || model === 'claude-sonnet-4') return fallback
  return model
}

const fastAgents = {
  speaker: {
    model: process.env.SPEAKER_MODEL || 'local-fast',
    role: 'Owns the spoken response. Uses one to three short, casual sentences.',
  },
  turnTaker: {
    model: process.env.TURN_TAKER_MODEL || 'local-fast',
    role: 'Decides whether the user finished and whether a brief interjection is appropriate.',
  },
  emotionReader: {
    model: process.env.EMOTION_MODEL || 'local-fast',
    role: 'Classifies mood, energy, and intent into a concise tone note.',
  },
}

// ============================================================================
// TOOLS
// Deterministic server-side functions used to prepare and process agent data.
// Keep external API calls and secrets on the server; never expose them to the browser.
// ============================================================================

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

function extractText(value) {
  if (typeof value === 'string') return value.trim()

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const text = extractText(value[index])
      if (text) return text
    }
    return ''
  }

  if (value && typeof value === 'object') {
    if (typeof value.content === 'string') return value.content.trim()
    if (typeof value.text === 'string') return value.text.trim()
    if (value.output) return extractText(value.output)
    if (value.outputs) return extractText(value.outputs)
    if (value.response) return extractText(value.response)
  }

  return ''
}

function getOutput(result) {
  return extractText(result.output || result.outputs || result.response)
}

function getErrorMessage(result, status) {
  if (typeof result.detail === 'string') return result.detail
  if (typeof result.error === 'string') return result.error
  if (result.error && typeof result.error.message === 'string') return result.error.message
  return `Swarms API returned ${status}.`
}

function readEmotion(question) {
  const text = question.toLowerCase()
  if (/\b(stressed|overwhelmed|worried|anxious|urgent|frustrated)\b/.test(text)) {
    return 'User sounds stressed; keep the answer calm and brief.'
  }
  if (/\b(excited|awesome|great|love|happy)\b/.test(text)) {
    return 'User sounds upbeat; stay warm without overdoing enthusiasm.'
  }
  if (/\bhow do i|what is|why does|can you explain|help me\b/.test(text)) {
    return 'User is seeking information; be clear, practical, and concise.'
  }
  return 'Use a relaxed, direct tone.'
}

function isGreeting(question) {
  return /^(hi|hello|hey|yo|hiya|greetings)(\s+jarvis)?[!.?,\s]*$/i.test(question.trim())
}

function retrieveMemories() {
  return memories.slice(-5).map((memory) => memory.fact)
}

function prepareDelivery(output) {
  const text = output
    .replace(/^["']|["']$/g, '')
    .replace(/^(Sure|Certainly|Of course)[,!]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    text,
    chunks: text.split(/(?<=[.!?])\s+/).filter(Boolean),
  }
}

function remember(facts) {
  for (const fact of facts) {
    if (typeof fact !== 'string' || !fact.trim()) continue
    if (!memories.some((memory) => memory.fact === fact.trim())) {
      memories.push({ fact: fact.trim(), createdAt: Date.now() })
    }
  }
  while (memories.length > maxMemoryEntries) memories.shift()
}

function updateJob(jobId, patch) {
  jobs.set(jobId, { ...(jobs.get(jobId) || {}), ...patch })
  while (jobs.size > maxJobEntries) jobs.delete(jobs.keys().next().value)
}

// ============================================================================
// AGENTS
// The Conversation Orchestrator interprets intent first, then routes the request
// to specialized agents and server-side tools.
// ============================================================================

async function callSwarms(name, task, agents, swarmType = 'MixtureOfAgents') {
  const swarmsResponse = await fetch(swarmsUrl, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.SWARMS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, swarm_type: swarmType, task, agents }),
  })
  const responseText = await swarmsResponse.text()
  let result
  try {
    result = responseText ? JSON.parse(responseText) : {}
  } catch (error) {
    console.error(`${name} returned invalid JSON:`, error)
    throw new Error('Swarms returned an invalid response.')
  }
  if (!swarmsResponse.ok) throw new Error(getErrorMessage(result, swarmsResponse.status))
  return result
}

function fallbackInterpretation(question, hasDocument) {
  const documentRequest = wantsDocument(question)
  const contextFollowUp = isDocumentContextFollowUp(question)
  const editRequest = hasDocument && (wantsDocumentEdit(question) || contextFollowUp)
  return {
    intent: editRequest ? 'edit_document' : !hasDocument && contextFollowUp ? 'clarify' : documentRequest ? 'create_document' : 'answer',
    task: !hasDocument && contextFollowUp
      ? 'Ask the user which document or subject they want to work on.'
      : question,
    format: null,
    needsClarification: false,
  }
}

function parseOrchestratorPlan(rawOutput, question) {
  const cleaned = rawOutput.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Orchestrator did not return a JSON object.')

  const plan = JSON.parse(cleaned.slice(start, end + 1))
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Conversation orchestrator returned an invalid plan.')
  }
  const validIntents = new Set(['answer', 'create_document', 'edit_document', 'clarify'])
  const formatAliases = {
    none: null,
    null: null,
    text: 'txt',
    markdown: 'md',
    word: 'docx',
  }
  const format = Object.prototype.hasOwnProperty.call(formatAliases, plan.format)
    ? formatAliases[plan.format]
    : plan.format ?? null
  const normalized = {
    intent: plan.intent,
    task: typeof plan.task === 'string' && plan.task.trim() ? plan.task.trim() : question,
    format,
    needsClarification: plan.needsClarification === true,
  }
  const validFormats = new Set(['txt', 'html', 'md', 'pdf', 'docx', null])
  if (!validIntents.has(normalized.intent)
    || !validFormats.has(normalized.format)) {
    throw new Error('Conversation orchestrator returned an invalid plan.')
  }
  return normalized
}

async function interpretConversation(question, recalledMemories) {
  const hasDocument = Boolean(latestDocumentId && getDocument(latestDocumentId))
  const fallback = fallbackInterpretation(question, hasDocument)
  if (!process.env.SWARMS_API_KEY || isGreeting(question)) return fallback

  try {
    const result = await callSwarms(
      'Jarvis Conversation Orchestrator',
      `Interpret the user's latest message and select the correct next action.
The user expects an autonomous assistant: infer reasonable details instead of asking unnecessary questions.
Use the existing document when the message is a follow-up such as "make it longer", "make it three pages", "translate it into French", "change the ending", or "just do it".
Return JSON only:
{"intent":"answer|create_document|edit_document|clarify","task":"a precise instruction for the next specialist","format":"txt|html|md|pdf|docx|null","needsClarification":false}
Existing document available: ${hasDocument ? 'yes' : 'no'}
Relevant memories: ${recalledMemories.join('; ') || 'none'}
User message:
<<<${question}>>>`,
      [{
        agent_name: 'ConversationOrchestrator',
        system_prompt:
          'Classify intent conservatively but supportively. Any request to write, draft, compose, create, or provide written work is a document request. Any follow-up that changes, expands, translates, or reformats an existing document is an edit request. Do not answer the user or refuse the task. Preserve the user’s goal in task. Use null format when unspecified.',
        model_name: configuredModel('ORCHESTRATOR_MODEL', fallbackModels.orchestrator),
      }],
    )
    const plan = parseOrchestratorPlan(getOutput(result), question)
    if (hasDocument && (wantsDocumentEdit(question) || isDocumentContextFollowUp(question))) {
      return { ...plan, intent: 'edit_document', task: question, needsClarification: false }
    }
    if (!hasDocument && isDocumentContextFollowUp(question)) {
      return {
        intent: 'clarify',
        task: 'Ask the user which document or subject they want to work on before editing.',
        format: null,
        needsClarification: true,
      }
    }
    return plan
  } catch (error) {
    console.error('Conversation orchestrator failed; using deterministic routing:', error)
    return fallback
  }
}

async function runMemoryKeeper(question, recalledMemories) {
  try {
    if (!process.env.SWARMS_API_KEY) return

    const result = await callSwarms(
      'Jarvis Memory Keeper',
      `Extract durable facts, preferences, or running callbacks from this user turn.
Return JSON only in this shape: {"facts":["..."]}. Return an empty array when there is nothing durable.
Previous memories: ${recalledMemories.join('; ') || 'none'}
User turn: ${question}`,
      [
        {
          agent_name: 'MemoryKeeper',
          system_prompt:
            'Extract only useful long-term user context. Never invent facts and never answer the user.',
          model_name: configuredModel('MEMORY_MODEL', fallbackModels.memory),
        },
      ],
    )
    const raw = getOutput(result).replace(/^```json\s*|\s*```$/g, '')
    const parsed = JSON.parse(raw)
    remember(Array.isArray(parsed.facts) ? parsed.facts : [])
  } catch (error) {
    console.error('Memory keeper failed:', error)
  }
}

async function runThinker(jobId, question, emotion, recalledMemories, interpretation) {
  try {
    if (!process.env.SWARMS_API_KEY) {
      updateJob(jobId, { status: 'failed', error: 'SWARMS_API_KEY is not configured on the server.' })
      return
    }

    if (isGreeting(question)) {
      const greeting = 'Hi! What can I help you with?'
      updateJob(jobId, { status: 'complete', output: greeting, chunks: [greeting] })
      return
    }

    const documentNote = wantsDocument(question) || (latestDocumentId && wantsDocumentEdit(question))
      ? '\nA written work or file is being prepared on screen. Do not refuse the writing request, brainstorm instead of completing it, or repeat its contents aloud. Mention only that the downloadable document is being prepared or is ready.'
      : ''
    const result = await callSwarms(
      'Jarvis Slow Layer',
      `Answer the exact user message below. Do not invent a different question or assume the user asked how you are doing.
User message:
<<<${question}>>>
Routing instruction: ${interpretation.task}
Tone note: ${emotion}
Relevant memories: ${recalledMemories.join('; ') || 'none'}${documentNote}`,
      [
          {
            agent_name: 'Thinker',
            system_prompt:
              'Answer the exact user message, not a generic conversation starter. Follow the routing instruction. If the route is clarify, ask one concise question for the missing subject or document; do not invent context. Do the hard reasoning, planning, and research needed for that message. If it is only a greeting, greet the user briefly; otherwise address the requested subject directly. Return useful findings for a final speaker.',
            model_name: configuredModel('THINKER_MODEL', fallbackModels.thinker),
          },
          {
            agent_name: 'PersonaGuardian',
            system_prompt:
              'Rewrite the draft in a natural voice while preserving its answer to the exact user message. Never replace a substantive answer with “how are you?” or a generic offer to help. Use one to three short sentences, casual phrasing, no headings, lists, robotic disclaimers, or over-apologizing. React before answering only when appropriate.',
            model_name: configuredModel('GUARDIAN_MODEL', fallbackModels.guardian),
          },
          {
            agent_name: 'DeliveryDirector',
            system_prompt:
              'Prepare the final text for speech: keep short streamable sentences, add no markup, and preserve a natural pause after the reaction.',
            model_name: configuredModel('DELIVERY_MODEL', fallbackModels.delivery),
          },
          {
            agent_name: 'Initiator',
            system_prompt:
              'If a relevant memory is available, add one subtle callback or follow-up. Otherwise leave the answer unchanged. Never force a callback.',
            model_name: configuredModel('INITIATOR_MODEL', fallbackModels.initiator),
          },
      ],
    )
    const delivery = prepareDelivery(getOutput(result))
    if (!delivery.text) {
      updateJob(jobId, { status: 'failed', error: 'Swarms returned no output.' })
      return
    }

    updateJob(jobId, { status: 'complete', output: delivery.text, chunks: delivery.chunks })
  } catch (error) {
    console.error('Slow thinker failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown slow-layer failure.'
    updateJob(jobId, { status: 'failed', error: `The slow layer failed: ${message}` })
  }
}

async function repairDocSpec(rawOutput, errors) {
  try {
    const result = await callSwarms(
      'Jarvis Document Repair',
      `Fix this output so it follows the required JSON shape.
Problems: ${errors.join(' ')}
Output to fix:
${rawOutput.slice(0, 12000)}`,
      [{
        agent_name: 'DocSpecRepair',
        system_prompt: `Repair malformed document JSON without changing its meaning. ${DOC_SPEC_PROMPT}`,
        model_name: configuredModel('DOC_STRUCTURE_MODEL', fallbackModels.docStructure),
      }],
    )
    return parseDocSpec(getOutput(result))
  } catch (error) {
    console.error('Document repair failed:', error)
    return { ok: false, errors: ['Repair attempt failed.'], warnings: [] }
  }
}

async function runDocumentWriter(jobId, question, recalledMemories, existingDocument = null, interpretation = null) {
  const setDocument = (document) => updateJob(jobId, { document })
  try {
    if (!process.env.SWARMS_API_KEY) {
      setDocument({ status: 'failed', error: 'SWARMS_API_KEY is not configured on the server.' })
      return
    }
    const result = await callSwarms(
      'Jarvis Document Pipeline',
      `${existingDocument
        ? `Edit the existing document according to the user's follow-up request. Preserve its subject, characters, tone, plot, and useful content unless the user asks to change them. For translation requests, translate the document itself while preserving its meaning and structure; do not ask the user to paste it. Make the requested change autonomously; do not ask where to begin.
Existing document:
${JSON.stringify(existingDocument.spec)}`
        : 'Create the document or file the user explicitly requested. Follow the user’s requested content and format exactly, even when the request is simple.'}
Do not explain how the user could make it themselves and do not ask them to provide content that is already specified.
User request: ${question}
Specialist instruction: ${interpretation?.task || question}
Relevant memories: ${recalledMemories.join('; ') || 'none'}`,
      [
        {
          agent_name: 'ContentWriter',
          system_prompt:
            'Execute the file request, including very small requests. If the user asks for a file containing specific text, preserve that text exactly and do not add commentary, headings, or extra content unless requested. Write the full content of the requested document when more detail is requested. Plain text only, no markdown symbols, no HTML, no URLs. Use only facts from the request or memories; write [TBD] for anything unknown instead of inventing it.',
          model_name: configuredModel('DOC_WRITER_MODEL', fallbackModels.docWriter),
        },
        {
          agent_name: 'StructureEditor',
          system_prompt: `Convert the draft into a document layout. Pick the theme that fits (report, memo, letter, or minimal), use headings, bullets, numbered lists, and tables where they improve readability, and keep the wording. ${DOC_SPEC_PROMPT}`,
          model_name: configuredModel('DOC_STRUCTURE_MODEL', fallbackModels.docStructure),
        },
      ],
      'SequentialWorkflow',
    )
    const rawOutput = getOutput(result)
    let parsed = parseDocSpec(rawOutput)
    if (!parsed.ok) parsed = await repairDocSpec(rawOutput, parsed.errors)
    if (!parsed.ok) {
      setDocument({ status: 'failed', error: `The document could not be structured: ${parsed.errors.join(' ')}` })
      return
    }
    const savedDocument = saveDocument(parsed.spec)
    latestDocumentId = savedDocument.id
    setDocument({
      status: 'ready',
      ...savedDocument,
      html: renderHtml(parsed.spec),
    })
  } catch (error) {
    console.error('Document writer failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown document failure.'
    setDocument({ status: 'failed', error: `The document step failed: ${message}` })
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url.startsWith('/api/chat/')) {
    const job = jobs.get(request.url.slice('/api/chat/'.length))
    sendJson(response, job ? 200 : 404, job || { error: 'Chat job not found.' })
    return
  }

  if (request.method === 'GET' && request.url.startsWith('/api/documents/')) {
    const url = new URL(request.url, 'http://localhost')
    const [id, action] = url.pathname.slice('/api/documents/'.length).split('/')
    if (!action) {
      const entry = getDocument(id)
      if (!entry) {
        sendJson(response, 404, { error: 'Document not found or expired.' })
        return
      }
      sendJson(response, 200, { id, title: entry.spec.title, spec: entry.spec, html: renderHtml(entry.spec), formats: EXPORT_FORMATS })
      return
    }
    if (action === 'export') {
      const format = url.searchParams.get('format') || ''
      if (!EXPORT_FORMATS.includes(format)) {
        sendJson(response, 400, { error: `format must be one of: ${EXPORT_FORMATS.join(', ')}` })
        return
      }
      try {
        const file = await exportDocument(id, format)
        if (!file) {
          sendJson(response, 404, { error: 'Document not found or expired.' })
          return
        }
        response.writeHead(200, {
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="${file.filename}"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        })
        response.end(file.body)
      } catch (error) {
        console.error('Document export failed:', error)
        sendJson(response, 500, { error: error instanceof Error ? error.message : 'Export failed.' })
      }
      return
    }
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  if (request.method !== 'POST' || request.url !== '/api/chat') {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  let body = ''
  for await (const chunk of request) body += chunk

  try {
    const { question } = JSON.parse(body)
    if (typeof question !== 'string' || !question.trim()) {
      sendJson(response, 400, { error: 'Please provide a question.' })
      return
    }

    const trimmedQuestion = question.trim()
    const emotion = readEmotion(trimmedQuestion)
    const recalledMemories = retrieveMemories()
    const interpretation = await interpretConversation(trimmedQuestion, recalledMemories)
    const jobId = randomUUID()
    updateJob(jobId, { status: 'thinking' })
    sendJson(response, 202, {
      jobId,
      status: 'thinking',
      layer: 'fast',
      roles: fastAgents,
    })
    const existingDocument = latestDocumentId ? getDocument(latestDocumentId) : null
    const editingDocument = Boolean(
      existingDocument
      && (interpretation.intent === 'edit_document'
        || wantsDocumentEdit(trimmedQuestion)
        || isDocumentContinuation(trimmedQuestion)),
    )
    const creatingDocument = interpretation.intent === 'create_document' || wantsDocument(trimmedQuestion)
    if (creatingDocument || editingDocument) {
      updateJob(jobId, { document: { status: 'pending' } })
      void runDocumentWriter(
        jobId,
        trimmedQuestion,
        recalledMemories,
        editingDocument ? existingDocument : null,
        interpretation,
      )
    }
    void runThinker(jobId, trimmedQuestion, emotion, recalledMemories, interpretation)
    void runMemoryKeeper(trimmedQuestion, recalledMemories)
  } catch (error) {
    console.error('Chat request failed:', error)
    sendJson(response, 400, { error: 'Please provide valid JSON.' })
  }
})

server.listen(port, () => {
  console.log(`Swarms server listening on http://localhost:${port}`)
})
