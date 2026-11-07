import 'dotenv/config'
import { createServer } from 'node:http'

const port = Number(process.env.PORT || 3001)
const swarmsUrl = 'https://api.swarms.world/v1/swarm/completions'

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
  if (!result || typeof result !== 'object') return `API returned ${status}.`
  if (typeof result.detail === 'string') return result.detail
  if (typeof result.error === 'string') return result.error
  if (result.error && typeof result.error.message === 'string') return result.error.message
  return `API returned ${status}.`
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function readApiResponse(response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

async function handleChat(request, response) {
  if (!process.env.SWARMS_API_KEY) {
    sendJson(response, 500, { error: 'SWARMS_API_KEY is not configured on the server.' })
    return
  }

  const { question } = JSON.parse((await readBody(request)).toString('utf8'))
  if (typeof question !== 'string' || !question.trim()) {
    sendJson(response, 400, { error: 'Please provide a question.' })
    return
  }

  const swarmsResponse = await fetch(swarmsUrl, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.SWARMS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Jarvis Test Swarm',
      swarm_type: 'MixtureOfAgents',
      task: question.trim(),
      agents: [
        {
          agent_name: 'Researcher',
          system_prompt:
            'Analyze the user question and identify the key facts needed for a strong answer. Provide your analysis to the final reviewer, not a greeting.',
          model_name: 'gpt-4o',
        },
        {
          agent_name: 'Reviewer',
          system_prompt:
            'Synthesize the swarm analysis into the single best answer to the user. Return only the final answer as plain text. Do not include agent names, team messages, JSON, or commentary about the swarm.',
          model_name: 'gpt-4o',
        },
      ],
    }),
  })

  const result = await readApiResponse(swarmsResponse)
  if (!swarmsResponse.ok) {
    sendJson(response, swarmsResponse.status, {
      error: getErrorMessage(result, swarmsResponse.status),
    })
    return
  }

  const output = getOutput(result)
  if (!output) {
    sendJson(response, 502, { error: 'Swarms returned no output.' })
    return
  }

  sendJson(response, 200, { output })
}

async function handleStt(request, response) {
  if (!process.env.ELEVENLABS_API_KEY) {
    sendJson(response, 500, { error: 'ELEVENLABS_API_KEY is not configured on the server.' })
    return
  }

  const incoming = new Request('http://localhost/api/stt', {
    method: 'POST',
    headers: { 'Content-Type': request.headers['content-type'] || '' },
    body: await readBody(request),
  })
  const audio = (await incoming.formData()).get('audio')
  if (!(audio instanceof Blob) || !audio.size) {
    sendJson(response, 400, { error: 'Please provide an audio recording.' })
    return
  }

  const form = new FormData()
  form.append('file', audio, audio.name || 'recording.webm')
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v1')
  const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: form,
  })
  const result = await readApiResponse(sttResponse)
  if (!sttResponse.ok) {
    sendJson(response, sttResponse.status, { error: getErrorMessage(result, sttResponse.status) })
    return
  }

  sendJson(response, 200, { text: typeof result.text === 'string' ? result.text : '' })
}

async function handleTts(request, response) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    sendJson(response, 500, {
      error: 'ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be configured on the server.',
    })
    return
  }

  const { text } = JSON.parse((await readBody(request)).toString('utf8'))
  if (typeof text !== 'string' || !text.trim()) {
    sendJson(response, 400, { error: 'Please provide text to speak.' })
    return
  }

  const ttsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
      }),
    },
  )

  if (!ttsResponse.ok) {
    const result = await readApiResponse(ttsResponse)
    sendJson(response, ttsResponse.status, { error: getErrorMessage(result, ttsResponse.status) })
    return
  }

  response.writeHead(200, {
    'Content-Type': ttsResponse.headers.get('content-type') || 'audio/mpeg',
  })
  response.end(Buffer.from(await ttsResponse.arrayBuffer()))
}

const server = createServer(async (request, response) => {
  if (request.method !== 'POST') {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  try {
    if (request.url === '/api/chat') await handleChat(request, response)
    else if (request.url === '/api/stt') await handleStt(request, response)
    else if (request.url === '/api/tts') await handleTts(request, response)
    else sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    console.error('API request failed:', error)
    sendJson(response, 500, { error: 'The server could not process that request.' })
  }
})

server.listen(port, () => {
  console.log(`Swarms server listening on http://localhost:${port}`)
})
