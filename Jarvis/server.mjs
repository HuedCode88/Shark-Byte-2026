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

function isImageRequest(transcript) {
  const interfaceRequest = /\b(login|log in|sign in|signin|form|interface|screen|dashboard|layout|mockup)\b/i.test(transcript)
  return !interfaceRequest && (
    /\b(show|generate|create|make|display|find)\b[\s\S]{0,80}\b(image|picture|photo|illustration|icon)\b/i.test(transcript)
      || /\b(image|picture|photo|illustration|icon)\b/i.test(transcript) && !/\b(chart|graph|table)\b/i.test(transcript)
  )
}

async function generateImageWithSwarms(transcript) {
  const imageModel = process.env.SWARMS_IMAGE_MODEL
  if (!imageModel) {
    throw new Error('SWARMS_IMAGE_MODEL is not configured. Use an image-capable model available through Swarms.')
  }
  const result = await callSwarms({
    name: 'Jarvis Image Generator',
    swarm_type: 'MixtureOfAgents',
    task: JSON.stringify({
      request: transcript,
      output: 'Generate the requested image and return JSON with image_url, alt, and caption. Do not return a placeholder, UI plan, or textual description in place of the image.',
    }),
    response_format: { type: 'json_object' },
    agents: [{
      agent_name: 'Image Generator',
      model_name: imageModel,
      system_prompt: 'Generate the requested image using your image-generation capability. Return exactly JSON {image_url:string,alt:string,caption:string}. image_url must be a directly renderable HTTP or HTTPS image URL. Do not return placeholder UI commands.',
    }],
  })
  const findImage = (value) => {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const image = findImage(value[index])
        if (image) return image
      }
      return null
    }
    if (!value || typeof value !== 'object') return null
    if (typeof value.image_url === 'string') return value
    for (const nested of Object.values(value)) {
      const image = findImage(nested)
      if (image) return image
    }
    return null
  }
  const text = getOutput(result)
  const image = findImage(result) || jsonObjectsIn(text).reverse().find((value) => typeof value.image_url === 'string')
  if (!image) throw new Error('The Swarms image model did not return a renderable image URL.')
  return image
}

function isProgressText(text) {
  return /^---\s*loop\s+\d+\/\d+\s+completed\s*---$/i.test(text.trim())
}

function extractText(value) {
  if (typeof value === 'string') {
    const text = value.trim()
    return isProgressText(text) ? '' : text
  }

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const text = extractText(value[index])
      if (text) return text
    }
    return ''
  }

  if (value && typeof value === 'object') {
    if (typeof value.answer === 'string' && !isProgressText(value.answer)) return value.answer.trim()
    if (typeof value.content === 'string' && !isProgressText(value.content)) return value.content.trim()
    if (typeof value.text === 'string' && !isProgressText(value.text)) return value.text.trim()
    if (value.output) return extractText(value.output)
    if (value.outputs) return extractText(value.outputs)
    if (value.response) return extractText(value.response)
    if (value.result) return extractText(value.result)
    if (value.data) return extractText(value.data)
  }

  return ''
}

function getOutput(result) {
  return extractText([result.output, result.outputs, result.response, result.result, result.data])
}

function findUiResponse(value) {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = findUiResponse(value[index])
      if (found) return found
    }
    return null
  }
  if (typeof value === 'string') {
    const candidates = jsonObjectsIn(value)
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const found = findUiResponse(candidates[index])
      if (found) return found
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  if (typeof value.answer === 'string' && Array.isArray(value.commands) && typeof value.speech === 'string') return value
  for (const nested of Object.values(value)) {
    const found = findUiResponse(nested)
    if (found) return found
  }
  return null
}

function findCommands(value) {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const commands = findCommands(value[index])
      if (commands?.length) return commands
    }
    return null
  }
  if (typeof value === 'string') {
    return findCommands(jsonObjectsIn(value))
  }
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value.commands) && value.commands.length) return value.commands
  for (const nested of Object.values(value)) {
    const commands = findCommands(nested)
    if (commands?.length) return commands
  }
  return null
}

function findVisualPlan(value) {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const plan = findVisualPlan(value[index])
      if (plan) return plan
    }
    return null
  }
  if (typeof value === 'string') return findVisualPlan(jsonObjectsIn(value))
  if (!value || typeof value !== 'object') return null
  if (value.image_request && typeof value.image_request === 'object') return value.image_request
  if (value.recommended_ui && typeof value.recommended_ui === 'object') return value
  for (const nested of Object.values(value)) {
    const plan = findVisualPlan(nested)
    if (plan) return plan
  }
  return null
}

function getErrorMessage(result, status) {
  if (typeof result.detail === 'string') return result.detail
  if (typeof result.error === 'string') return result.error
  if (result.error && typeof result.error.message === 'string') return result.error.message
  return `Swarms API returned ${status}.`
}

function isVisualRequest(transcript) {
  return /\b(show|display|visuali[sz]e|visual|chart|graph|plot|table|timeline|checklist|image|picture|window|panel|dashboard|login|form|interface|screen)\b/i.test(transcript)
}

async function repairMissingUiCommand(transcript, answer, snapshot) {
  const result = await callSwarms({
    name: 'Jarvis UI Composer Repair',
    swarm_type: 'MixtureOfAgents',
    task: JSON.stringify({ transcript, intermediate_visual_plan: findVisualPlan(answer), answer, snapshot }),
    response_format: { type: 'json_object' },
    agents: [{
      agent_name: 'UI Composer',
      model_name: process.env.SWARMS_COMPOSER_MODEL || process.env.SWARMS_DIRECTOR_MODEL || 'gpt-5.4-mini',
      system_prompt: 'You are a UI execution agent, not a writing agent. You receive intermediate plans such as image_request and recommended_ui. You MUST transform that plan into one non-empty commands array; never repeat the plan. Return exactly {answer,commands,speech}. For a login screen, emit DynamicUI data, not a description. Example shape: {"answer":"Rendered the requested interface.","commands":[{"op":"openWindow","id":"generated-ui","title":"Generated interface","component":"DynamicUI","props":{"tree":{"type":"section","children":[{"type":"h1","text":"..."},{"type":"input","attrs":{"type":"email","placeholder":"..."}}]}}}],"speech":"The interface is on screen."}. Use DynamicUI for novel interfaces, forms, screens, and dashboards. DynamicUI props must be {tree:{type,text?,attrs?,style?,children?}} with only section, div, h1, h2, h3, p, span, label, button, input, img nodes. Use Chart, DataTable, or ImageCard when appropriate. Do not summarize the design, do not return prose-only output, do not return ASCII art, JSX, JavaScript, or CSS source. Return only JSON with commands containing the renderable UI.',
    }],
  })
  const candidate = result.output || result.outputs || result.response || result.result || result.data || result
  const parsed = findUiResponse(candidate) || (() => {
    const commands = findCommands(candidate)
    return commands ? { answer, commands, speech: answer.slice(0, 500) } : null
  })() || (typeof candidate === 'object' ? candidate : (() => {
    try { return JSON.parse(extractText(candidate)) } catch { return null }
  })())
  const normalized = parsed ? normalizeVisualResponse(parsed, transcript) : null
  return normalized?.commands.length ? normalized : null
}

function jsonObjectsIn(text) {
  const objects = []
  let start = -1
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') {
      quoted = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0) {
        try {
          objects.push(JSON.parse(text.slice(start, index + 1)))
        } catch {
          // Ignore non-JSON brace-delimited text.
        }
        start = -1
      }
    }
  }
  return objects
}

function findLegacyCommands(value) {
  if (Array.isArray(value)) return value.flatMap(findLegacyCommands)
  if (!value || typeof value !== 'object') return []
  const commands = Array.isArray(value.commands) ? value.commands : []
  return [...commands, ...Object.values(value).flatMap(findLegacyCommands)]
}

function normalizeLegacyCommand(command, index) {
  if (!command || typeof command !== 'object') return null
  const props = command.props && typeof command.props === 'object' ? command.props : {}
  if ((command.type === 'image' || command.type === 'show_image') && typeof (command.url || command.image_url) === 'string') {
    const url = command.url || command.image_url
    return {
      op: 'openWindow',
      id: String(command.window_id || `visual-result-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64),
      title: String(command.title || 'Requested image'),
      component: 'ImageCard',
      props: { url, alt: String(command.alt || command.title || 'Image provided by Jarvis') },
    }
  }
  if (command.type === 'update_window' || command.type === 'open_window') {
    const component = command.component === 'ChartPanel' && Array.isArray(props.series)
      ? 'Chart'
      : ['ImageCard', 'ImagePanel'].includes(command.component) && typeof (props.url || props.image_url) === 'string'
        ? 'ImageCard'
        : 'TextPanel'
    if (component === 'ImageCard' && props.image_url && !props.url) props.url = props.image_url
    return {
      op: 'openWindow',
      id: String(command.window_id || `visual-result-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64),
      title: String(props.eyebrow || 'Jarvis visual result'),
      component,
      props,
    }
  }
  if (command.type === 'set_focus') {
    return { op: 'focusWindow', id: String(command.window_id || 'visual-result').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) }
  }
  return null
}

function parseLegacyVisualResponse(text) {
  const commands = [...new Map(jsonObjectsIn(text)
    .flatMap(findLegacyCommands)
    .map(normalizeLegacyCommand)
    .filter(Boolean)
    .map((command) => [`${command.op}:${command.id}`, command])).values()]
    .slice(0, 8)
  if (!commands.length) return null
  const response = jsonObjectsIn(text)
    .map((value) => value.recommended_response)
    .find((value) => typeof value === 'string')
  const answer = response || 'I updated the requested visual.'
  return { answer, commands, speech: answer.slice(0, 500) }
}

function parseEmbeddedVisualPlan(text) {
  const legacyResponse = parseLegacyVisualResponse(text)
  if (legacyResponse) return legacyResponse
  const candidate = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || text
  if (!candidate.trim().startsWith('{')) return null
  try {
    const plan = JSON.parse(candidate)
    if (!plan || typeof plan !== 'object' || !plan.recommended_ui || !Array.isArray(plan.recommended_ui.windows)) return null
    const commands = plan.recommended_ui.windows.slice(0, 4).flatMap((window, index) => {
      if (!window || typeof window !== 'object') return []
      const content = window.content && typeof window.content === 'object' ? window.content : {}
      const imageUrl = typeof (content.url || content.image_url) === 'string' && /^https?:\/\//i.test(content.url || content.image_url) ? content.url || content.image_url : null
      const chart = Array.isArray(content.series) ? { series: content.series } : null
      const component = imageUrl ? 'ImageCard' : chart ? 'Chart' : 'TextPanel'
      const props = imageUrl
        ? { url: imageUrl, alt: String(content.alt || window.title || 'Jarvis image'), caption: typeof content.caption === 'string' ? content.caption : undefined }
        : chart
          ? chart
        : {
            eyebrow: 'REQUESTED VIEW',
            text: String(content.prompt || content.text || plan.recommended_ui.prompt || 'Jarvis is ready for more information.'),
          }
      return [{
        op: 'openWindow',
        id: `visual-result-${index + 1}`,
        title: String(window.title || 'Jarvis visual result').slice(0, 120),
        component,
        props,
        placement: { dock: index === 0 ? 'right' : 'bottom' },
      }]
    })
    if (!commands.length) return null
    const answer = typeof plan.recommended_response === 'string'
      ? plan.recommended_response
      : 'I prepared the requested visual.'
    return { answer, commands, speech: answer.slice(0, 500) }
  } catch {
    return null
  }
}

function classifyTurn(transcript) {
  const text = transcript.trim().toLowerCase()
  if (/^(hi|hello|hey|yo|good morning|good afternoon|good evening)( jarvis)?[!.?]*$/.test(text)) return 'direct'
  if (/\b(show|display|visuali[sz]e|visual|chart|graph|plot|table|timeline|checklist|image|picture|window|panel|dashboard)\b/.test(text)) return 'standard'
  if (text.length <= 120 && !/\b(compare|analyze|research|design|plan|summarize|explain in detail|deep dive|step by step)\b/.test(text)) return 'direct'
  if (/\b(research|investigate|compare|several|multiple|independent|parallel)\b/.test(text)) return 'parallel'
  if (/\b(deep dive|thorough|comprehensive|long-form|in depth)\b/.test(text)) return 'deep'
  return 'standard'
}

async function callSwarms(body, url = swarmsUrl) {
  const swarmsResponse = await fetch(url, {
    method: 'POST',
    headers: { 'x-api-key': process.env.SWARMS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const responseText = await swarmsResponse.text()
  let result
  try {
    result = responseText ? JSON.parse(responseText) : {}
  } catch {
    throw new Error(`Swarms returned ${swarmsResponse.status}: ${responseText.slice(0, 500)}`)
  }
  if (!swarmsResponse.ok) {
    console.error('Swarms API validation error:', JSON.stringify(result, null, 2))
    throw new Error(`Swarms returned ${swarmsResponse.status}: ${getErrorMessage(result, swarmsResponse.status)}`)
  }
  return result
}

async function runDirectRequest(transcript, conversation) {
  const greeting = transcript.trim().toLowerCase()
  if (/^(hi|hello|hey|yo|good morning|good afternoon|good evening)( jarvis)?[!.?]*$/.test(greeting)) {
    return { answer: 'Hello! I’m Jarvis. What can I help you with?', commands: [], speech: 'Hello! I’m Jarvis. What can I help you with?' }
  }
  const result = await callSwarms({
    name: 'Jarvis Direct Assistant',
    swarm_type: 'MixtureOfAgents',
    task: JSON.stringify({ transcript, conversation }),
    agents: [{
      agent_name: 'Jarvis',
      model_name: process.env.SWARMS_FAST_MODEL || 'gpt-5.4-mini',
      system_prompt: 'You are Jarvis, a friendly conversational AI assistant. Answer the user directly and naturally. For greetings, greet them back and invite them to continue. Do not return JSON, UI commands, markup, code, or a description of your internal process.',
    }],
  })
  const answer = getOutput(result)
  if (!answer) throw new Error('Swarms returned no conversational answer.')
  return { answer, commands: [], speech: answer.slice(0, 500) }
}

const server = createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/ui') {
    let body = ''
    for await (const chunk of request) body += chunk
    try {
      const { transcript, snapshot, conversation } = JSON.parse(body)
      const result = await runUiRequest(String(transcript || ''), snapshot, conversation)
      sendJson(response, 200, result)
    } catch (error) {
      console.error('UI swarm request failed:', error)
      sendJson(response, 500, { error: error.message || 'The UI swarm failed.' })
    }
    return
  }

  if (request.method !== 'POST' || request.url !== '/api/chat') {
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
    const { question, snapshot, conversation } = JSON.parse(body)
    if (typeof question !== 'string' || !question.trim()) {
      sendJson(response, 400, { error: 'Please provide a question.' })
      return
    }
    const result = await runUiRequest(question.trim(), snapshot || {}, conversation)
    sendJson(response, 200, { output: result.answer, ...result })
  } catch (error) {
    console.error('Swarms request failed:', error)
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'The server could not process that question.' })
  }
})

function validUiResponse(value) {
  if (!value || typeof value !== 'object' || typeof value.answer !== 'string' || !Array.isArray(value.commands) || typeof value.speech !== 'string') return null
  const allowedOps = new Set(['openWindow', 'updateWindow', 'closeWindow', 'moveWindow', 'focusWindow', 'setLayout', 'setTheme', 'highlight', 'toast', 'undo'])
  const commands = value.commands.filter((command) => command && allowedOps.has(command.op)).slice(0, 8)
  return { answer: value.answer.trim().slice(0, 12000), commands, speech: value.speech.trim().slice(0, 500) }
}

function normalizeVisualResponse(value, transcript) {
  const valid = validUiResponse(value)
  if (!valid) return null
  const embeddedPlan = parseEmbeddedVisualPlan(valid.answer)
  if (embeddedPlan) return embeddedPlan
  return valid
}

async function runUiRequest(transcript, snapshot, conversation = []) {
  if (!process.env.SWARMS_API_KEY) throw new Error('SWARMS_API_KEY is not configured on the server.')
  if (isImageRequest(transcript)) {
    const image = await generateImageWithSwarms(transcript)
    const answer = image.caption || 'I generated an image for you.'
    return {
      answer,
      commands: [{
        op: 'openWindow',
        id: 'visual-result',
        title: 'Generated image',
        component: 'ImageCard',
        props: { url: image.image_url, alt: image.alt || transcript, caption: image.caption || 'Generated by Jarvis' },
        placement: { dock: 'right' },
      }],
      speech: answer.slice(0, 500),
    }
  }
  const tier = classifyTurn(transcript)
  if (tier === 'direct') return runDirectRequest(transcript, conversation)
  const result = await callSwarms({
      name: 'Generative UI Swarm',
      swarm_type: 'HierarchicalSwarm',
      task: JSON.stringify({ tier, transcript, conversation, snapshot }),
      response_format: { type: 'json_object' },
      agents: [
        { agent_name: 'UI Director', model_name: process.env.SWARMS_DIRECTOR_MODEL || 'gpt-5.4-mini', system_prompt: 'You are the director. Classify the request, delegate to the relevant specialists, reconcile their outputs, and return exactly {answer,commands,speech}. Delegate context to Context Analyst; task type to Intent Router; facts/data to Content Specialist; interface requirements to Visual Architect; windows to Layout Planner; declarative React-compatible UI to UI Composer; image assets to Image Specialist; accessibility to Accessibility Reviewer; safety/schema to Validator; and spoken output to Speech Formatter. Requests for an image of an interface, login screen, form, dashboard, or mockup mean build the interface with DynamicUI, not a prose description. Never emit ASCII mockups, JSX, JavaScript, CSS source, or prose instead of commands.' },
        { agent_name: 'Intent Router', model_name: process.env.SWARMS_ROUTER_MODEL || 'gpt-5.4-mini', system_prompt: 'Classify the request as conversation, visual, data, image, form, or mixed. Identify required specialists and constraints. Return routing data only.' },
        { agent_name: 'Context Analyst', model_name: process.env.SWARMS_CONTEXT_MODEL || 'gpt-5.4-mini', system_prompt: 'Summarize visible windows, focused window, conversation, viewport, and user changes. Return structured context only.' },
        { agent_name: 'Content Specialist', model_name: process.env.SWARMS_CONTENT_MODEL || 'gpt-5.4-mini', system_prompt: 'Produce accurate structured facts, steps, rows, key-values, or chart series. Do not decide layout or emit code.' },
        { agent_name: 'Visual Architect', model_name: process.env.SWARMS_VISUAL_MODEL || 'gpt-5.4-mini', system_prompt: 'Translate the request into information hierarchy, components, interactions, and visual priorities. Do not emit JSX or source code.' },
        { agent_name: 'Layout Planner', model_name: process.env.SWARMS_LAYOUT_MODEL || 'gpt-5.4-mini', system_prompt: 'Choose windows, layouts, placements, reuse, and close actions from the architecture and snapshot. Return a plan only.' },
        { agent_name: 'UI Composer', model_name: process.env.SWARMS_COMPOSER_MODEL || 'gpt-5.4-mini', system_prompt: 'Convert specialist outputs into valid UiCommand objects. Use Chart, DataTable, ImageCard, or DynamicUI. DynamicUI uses only section, div, h1, h2, h3, p, span, label, button, input, img nodes with data style/attrs. Never return ASCII, JSX, executable code, or invented URLs.' },
        { agent_name: 'Render QA', model_name: process.env.SWARMS_RENDER_QA_MODEL || 'gpt-4o-mini', system_prompt: 'Review the composed commands as if they will be rendered by React. Verify every component, prop, DynamicUI node, style value, attribute, placement, and required field. Repair malformed payloads and return only a corrected non-empty commands array. Never replace a command with prose.' },
        { agent_name: 'Image Specialist', model_name: process.env.SWARMS_IMAGE_MODEL || 'gpt-5.4-mini', system_prompt: 'Handle image requirements. Use an approved image tool or supplied URL when available; otherwise report that an asset is unavailable. Never invent image URLs or substitute a label for an image.' },
        { agent_name: 'Accessibility Reviewer', model_name: process.env.SWARMS_A11Y_MODEL || 'gpt-4o-mini', system_prompt: 'Review proposed UI for labels, alt text, keyboard-friendly controls, readable structure, and safe attributes. Return corrections only.' },
        { agent_name: 'Validator', model_name: process.env.SWARMS_VALIDATOR_MODEL || 'gpt-4o-mini', system_prompt: 'Validate and repair the final response against the shared UiCommand schema and DynamicUI limits. Remove unsafe, unknown, malformed, or excessive commands. Return the final structured response.' },
        { agent_name: 'Speech Formatter', model_name: process.env.SWARMS_SPEECH_MODEL || 'gpt-4o-mini', system_prompt: 'Write one to three short spoken sentences that accurately describe the answer and what is on screen. No markdown, URLs, code, or jargon.' },
      ],
  })
  const candidate = result.output || result.outputs || result.response || result.result || result.data || result
  const nestedResponse = findUiResponse(candidate)
  if (nestedResponse) {
    const normalized = normalizeVisualResponse(nestedResponse, transcript)
    if (normalized && normalized.commands.length) return normalized
    const repaired = await repairMissingUiCommand(transcript, nestedResponse.answer, snapshot)
    if (repaired) return repaired
    throw new Error('The UI swarm returned a prose description without renderable UI commands.')
  }
  if (candidate && typeof candidate === 'object' && typeof candidate.answer === 'string' && !isProgressText(candidate.answer)) {
    const embeddedPlan = parseEmbeddedVisualPlan(candidate.answer)
    if (embeddedPlan) return embeddedPlan
    const normalized = normalizeVisualResponse(candidate, transcript)
    if (normalized && normalized.commands.length) return normalized
    const repaired = await repairMissingUiCommand(transcript, candidate.answer, snapshot)
    if (repaired) return repaired
    throw new Error('The UI swarm returned a prose description without renderable UI commands.')
  }
  const text = extractText(candidate)
  const embeddedPlan = parseEmbeddedVisualPlan(text)
  if (embeddedPlan) return embeddedPlan
  const visualPlan = findVisualPlan(candidate) || findVisualPlan(text)
  if (visualPlan && isVisualRequest(transcript)) {
    const repaired = await repairMissingUiCommand(transcript, JSON.stringify(visualPlan), snapshot)
    if (repaired) return repaired
    throw new Error('The swarm produced an internal visual plan but no renderable UI command.')
  }
  if (!text && isVisualRequest(transcript)) {
    const repaired = await repairMissingUiCommand(transcript, JSON.stringify(candidate), snapshot)
    if (repaired) return repaired
  }
  try {
    const parsed = JSON.parse(text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || text)
    const normalized = normalizeVisualResponse(parsed, transcript)
    if (normalized && (normalized.commands.length || !isVisualRequest(transcript))) return normalized
    const repaired = await repairMissingUiCommand(transcript, text, snapshot)
    if (repaired) return repaired
    if (isVisualRequest(transcript)) throw new Error('The UI swarm returned a prose description without renderable UI commands.')
    return normalized || { answer: text, commands: [], speech: text.slice(0, 500) }
  } catch {
    if (text && isVisualRequest(transcript)) {
      const repaired = await repairMissingUiCommand(transcript, text, snapshot)
      if (repaired) return repaired
    }
    if (text) return { answer: text, commands: [], speech: text.slice(0, 500) }
    throw new Error('Swarms returned no answer.')
  }
}

server.listen(port, () => {
  console.log(`Swarms server listening on http://localhost:${port}`)
})
