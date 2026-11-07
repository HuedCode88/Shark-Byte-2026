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
  if (typeof result.detail === 'string') return result.detail
  if (typeof result.error === 'string') return result.error
  if (result.error && typeof result.error.message === 'string') return result.error.message
  return `Swarms API returned ${status}.`
}

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/api/chat') {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  if (!process.env.SWARMS_API_KEY) {
    sendJson(response, 500, { error: 'SWARMS_API_KEY is not configured on the server.' })
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

    const responseText = await swarmsResponse.text()
    let result

    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (parseError) {
      console.error('Swarms returned invalid JSON:', parseError)
      sendJson(response, 502, { error: 'Swarms returned an invalid response.' })
      return
    }

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
  } catch (error) {
    console.error('Swarms request failed:', error)
    sendJson(response, 500, { error: 'The server could not process that question.' })
  }
})

server.listen(port, () => {
  console.log(`Swarms server listening on http://localhost:${port}`)
})
