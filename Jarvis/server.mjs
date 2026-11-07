import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const port = Number(process.env.PORT || 3001)
const swarmsUrl = 'https://api.swarms.world/v1/swarm/completions'
const jobs = new Map()
const memories = []
const maxMemoryEntries = 20
const maxJobEntries = 100
const fallbackModels = {
  thinker: 'gpt-4o',
  memory: 'gpt-4o-mini',
  guardian: 'gpt-4o',
  delivery: 'gpt-4o-mini',
  initiator: 'gpt-4o',
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

async function callSwarms(name, task, agents) {
  const swarmsResponse = await fetch(swarmsUrl, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.SWARMS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, swarm_type: 'MixtureOfAgents', task, agents }),
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

async function runThinker(jobId, question, emotion, recalledMemories) {
  try {
    if (!process.env.SWARMS_API_KEY) {
      jobs.set(jobId, { status: 'failed', error: 'SWARMS_API_KEY is not configured on the server.' })
      return
    }

    const result = await callSwarms(
      'Jarvis Slow Layer',
      `Answer the user’s question conversationally: ${question}
Tone note: ${emotion}
Relevant memories: ${recalledMemories.join('; ') || 'none'}`,
      [
          {
            agent_name: 'Thinker',
            system_prompt:
              'Do the hard reasoning, planning, and research needed for the user question. Return useful findings for a final speaker.',
            model_name: configuredModel('THINKER_MODEL', fallbackModels.thinker),
          },
          {
            agent_name: 'PersonaGuardian',
            system_prompt:
              'Rewrite the draft in a natural voice. Use one to three short sentences, casual phrasing, no headings, lists, robotic disclaimers, or over-apologizing. React before answering when appropriate.',
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
      jobs.set(jobId, { status: 'failed', error: 'Swarms returned no output.' })
      return
    }

    jobs.set(jobId, { status: 'complete', output: delivery.text, chunks: delivery.chunks })
    while (jobs.size > maxJobEntries) jobs.delete(jobs.keys().next().value)
  } catch (error) {
    console.error('Slow thinker failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown slow-layer failure.'
    jobs.set(jobId, { status: 'failed', error: `The slow layer failed: ${message}` })
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url.startsWith('/api/chat/')) {
    const job = jobs.get(request.url.slice('/api/chat/'.length))
    sendJson(response, job ? 200 : 404, job || { error: 'Chat job not found.' })
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
    const jobId = randomUUID()
    jobs.set(jobId, { status: 'thinking' })
    sendJson(response, 202, {
      jobId,
      status: 'thinking',
      layer: 'fast',
      roles: fastAgents,
    })
    void runThinker(jobId, trimmedQuestion, emotion, recalledMemories)
    void runMemoryKeeper(trimmedQuestion, recalledMemories)
  } catch (error) {
    console.error('Chat request failed:', error)
    sendJson(response, 400, { error: 'Please provide valid JSON.' })
  }
})

server.listen(port, () => {
  console.log(`Swarms server listening on http://localhost:${port}`)
})
