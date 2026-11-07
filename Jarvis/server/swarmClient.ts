import { swarmResponseSchema, type SwarmResponse } from '../shared/uiCommands'
import { agents } from './swarm/agents'

const endpoint = process.env.SWARMS_API_URL || 'https://api.swarms.world/v1/swarm/completions'
const callsBySession = new Map<string, { startedAt: number; count: number }>()

function extractText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(extractText).find(Boolean) || ''
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['content', 'text', 'output', 'outputs', 'response']) {
      const text = extractText(record[key])
      if (text) return text
    }
  }
  return ''
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text
  return JSON.parse(fenced)
}

export async function runUiSwarm(sessionId: string, transcript: string, snapshot: unknown): Promise<SwarmResponse> {
  const now = Date.now()
  const usage = callsBySession.get(sessionId)
  if (usage && now - usage.startedAt < 60_000 && usage.count >= 12) throw new Error('Swarm rate limit exceeded')
  callsBySession.set(sessionId, usage && now - usage.startedAt < 60_000 ? { ...usage, count: usage.count + 1 } : { startedAt: now, count: 1 })
  if (!process.env.SWARMS_API_KEY) throw new Error('SWARMS_API_KEY is not configured on the server.')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-api-key': process.env.SWARMS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Generative UI Swarm',
      swarm_type: 'HierarchicalSwarm',
      task: JSON.stringify({ transcript, snapshot }),
      agents: [agents.director, agents.contextAnalyst, ...agents.contentSpecialists, agents.layoutPlanner, agents.uiComposer, agents.validator, agents.speechFormatter],
      response_format: { type: 'json_object' },
    }),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Swarms API returned ${response.status}`)
  const raw = parseJson(extractText(JSON.parse(body)))
  const parsed = swarmResponseSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Rejected invalid swarm response', parsed.error.flatten())
    return { commands: [], speech: 'I could not safely update the screen yet.' }
  }
  return parsed.data
}
