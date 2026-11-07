import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'

export const EXPORT_FORMATS = ['txt', 'html', 'md', 'pdf', 'docx']

export const DOC_SPEC_PROMPT = `Return JSON only with this shape:
{"title":"string","theme":"report|memo|letter|minimal","blocks":[
  {"type":"heading","text":"string","level":1},
  {"type":"paragraph","text":"string"},
  {"type":"bullets","items":["string"]},
  {"type":"numbered","items":["string"]},
  {"type":"table","headers":["string"],"rows":[["string"]]},
  {"type":"callout","text":"string"},
  {"type":"divider"}
]}
Use plain text only. Do not include HTML, CSS, JavaScript, markdown, URLs, or extra JSON fields.`

const documents = new Map()
const maxDocuments = 50
const documentTtlMs = 60 * 60 * 1000
const blockTypes = new Set(['heading', 'paragraph', 'bullets', 'numbered', 'table', 'callout', 'divider'])
const themes = new Set(['report', 'memo', 'letter', 'minimal'])

function cleanText(value, field, errors, maxLength = 4000) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${field} must be a non-empty string.`)
    return ''
  }
  return value.split('\u0000').join('').trim().slice(0, maxLength)
}

function cleanItems(value, field, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${field} must be a non-empty array.`)
    return []
  }
  return value.slice(0, 100).map((item, index) => cleanText(item, `${field}[${index}]`, errors, 1000))
}

export function parseDocSpec(rawOutput) {
  const errors = []
  let value
  const raw = typeof rawOutput === 'string'
    ? rawOutput.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim()
    : rawOutput

  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return { ok: false, errors: ['The document pipeline did not return valid JSON.'], warnings: [] }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['DocSpec must be a JSON object.'], warnings: [] }
  }

  const title = cleanText(value.title, 'title', errors, 200)
  const theme = themes.has(value.theme) ? value.theme : 'minimal'
  if (value.theme !== undefined && !themes.has(value.theme)) {
    errors.push('theme must be report, memo, letter, or minimal.')
  }
  if (!Array.isArray(value.blocks) || value.blocks.length === 0) {
    errors.push('blocks must be a non-empty array.')
  }

  const blocks = Array.isArray(value.blocks)
    ? value.blocks.slice(0, 200).map((block, index) => {
        if (!block || typeof block !== 'object' || !blockTypes.has(block.type)) {
          errors.push(`blocks[${index}] has an unsupported type.`)
          return null
        }
        if (block.type === 'divider') return { type: 'divider' }
        if (block.type === 'heading') {
          const level = Number.isInteger(block.level) ? Math.min(3, Math.max(1, block.level)) : 2
          return { type: 'heading', text: cleanText(block.text, `blocks[${index}].text`, errors), level }
        }
        if (block.type === 'paragraph' || block.type === 'callout') {
          return { type: block.type, text: cleanText(block.text, `blocks[${index}].text`, errors) }
        }
        if (block.type === 'bullets' || block.type === 'numbered') {
          return { type: block.type, items: cleanItems(block.items, `blocks[${index}].items`, errors) }
        }
        const headers = cleanItems(block.headers, `blocks[${index}].headers`, errors)
        const rows = Array.isArray(block.rows)
          ? block.rows.slice(0, 100).map((row, rowIndex) => {
              if (!Array.isArray(row)) {
                errors.push(`blocks[${index}].rows[${rowIndex}] must be an array.`)
                return []
              }
              return row.slice(0, headers.length || 20).map((cell, cellIndex) =>
                cleanText(cell, `blocks[${index}].rows[${rowIndex}][${cellIndex}]`, errors, 1000),
              )
            })
          : []
        if (!Array.isArray(block.rows)) errors.push(`blocks[${index}].rows must be an array.`)
        return { type: 'table', headers, rows }
      }).filter(Boolean)
    : []

  if (errors.length) return { ok: false, errors, warnings: [] }
  return { ok: true, spec: { title, theme, blocks }, errors: [], warnings: [] }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]))
}

function renderBlock(block) {
  if (block.type === 'divider') return '<hr>'
  if (block.type === 'heading') return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`
  if (block.type === 'paragraph') return `<p>${escapeHtml(block.text)}</p>`
  if (block.type === 'callout') return `<aside>${escapeHtml(block.text)}</aside>`
  if (block.type === 'bullets' || block.type === 'numbered') {
    const tag = block.type === 'bullets' ? 'ul' : 'ol'
    return `<${tag}>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`
  }
  return `<table><thead><tr>${block.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${block.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

export function renderHtml(spec) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
    body{font-family:Arial,sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#172033;line-height:1.55}
    h1{font-size:2.1rem;border-bottom:2px solid #d5dbea;padding-bottom:12px}h2,h3{margin-top:28px}
    aside{border-left:4px solid #4763d1;background:#eef1ff;padding:12px 16px;margin:20px 0}
    table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #ccd2df;padding:8px;text-align:left}th{background:#f1f3f8}
    hr{border:0;border-top:1px solid #ccd2df;margin:24px 0}
  </style></head><body><h1>${escapeHtml(spec.title)}</h1>${spec.blocks.map(renderBlock).join('')}</body></html>`
}

function renderMarkdown(spec) {
  return `# ${spec.title}\n\n${spec.blocks.map((block) => {
    if (block.type === 'divider') return '---'
    if (block.type === 'heading') return `${'#'.repeat(block.level + 1)} ${block.text}`
    if (block.type === 'paragraph' || block.type === 'callout') return block.text
    if (block.type === 'bullets') return block.items.map((item) => `- ${item}`).join('\n')
    if (block.type === 'numbered') return block.items.map((item, index) => `${index + 1}. ${item}`).join('\n')
    return [block.headers.join(' | '), block.headers.map(() => '---').join(' | '), ...block.rows.map((row) => row.join(' | '))].join('\n')
  }).join('\n\n')}\n`
}

function renderText(spec) {
  if (spec.blocks.length === 1 && spec.blocks[0].type === 'paragraph') {
    return `${spec.blocks[0].text}\n`
  }
  return `${spec.title}\n\n${spec.blocks.map((block) => {
    if (block.type === 'divider') return '----------------------------------------'
    if (block.type === 'heading') return block.text
    if (block.type === 'paragraph' || block.type === 'callout') return block.text
    if (block.type === 'bullets') return block.items.map((item) => `- ${item}`).join('\n')
    if (block.type === 'numbered') return block.items.map((item, index) => `${index + 1}. ${item}`).join('\n')
    return [block.headers.join(' | '), ...block.rows.map((row) => row.join(' | '))].join('\n')
  }).join('\n\n')}\n`
}

export function wantsDocument(question) {
  const writtenWork = /\b(paper|essay|article|story|short story|fiction|fanfiction|poem|poetry|script|screenplay|proposal|brief|resume|cover letter|lesson plan|study guide|outline)\b/i
  const artifact = /\b(document|text file|txt file|file|pdf|docx|word file|report|memo|letter|worksheet|plan)\b/i
  const creationVerb = /\b(write|create|make|generate|draft|compose|prepare|produce|save|export)\b/i
  return (creationVerb.test(question) && (writtenWork.test(question) || artifact.test(question)))
    || /\b(give|send|provide)\b.{0,40}\b(document|file|paper|essay|story|report|pdf|docx)\b/i.test(question)
}

export function wantsDocumentEdit(question) {
  return /\b(expand|extend|lengthen|shorten|condense|rewrite|revise|edit|update|change|improve|add|remove|delete|fix|make it longer|make it shorter|few pages|more detail|less detail)\b/i.test(question)
    || /\b(make|turn|expand|extend)\b.{0,20}\b\d+\s+pages?\b/i.test(question)
    || /\b\d+\s+pages?\b/i.test(question)
    || /\b(translate|translation|put|convert|rewrite)\b.{0,40}\b(in|into|to)\s+(english|french|spanish|german|italian|portuguese|japanese|chinese)\b/i.test(question)
    || /\b(in|into)\s+(english|french|spanish|german|italian|portuguese|japanese|chinese)\b/i.test(question)
}

export function isDocumentContinuation(question) {
  return /^(nope|no|yes|sure|okay|ok|go ahead|do it|just do it|that's fine|thats fine)\b/i.test(question.trim())
}

export function isDocumentContextFollowUp(question) {
  const text = question.trim()
  return /\b(it|this|that|the document|the paper|the story|the fanfiction|the file|the draft)\b/i.test(text)
    && /\b(add|change|continue|convert|edit|expand|extend|fix|improve|make|put|rewrite|shorten|translate|update)\b/i.test(text)
    || /^(make|rewrite|edit|change|improve|expand|extend|continue|finish|translate|convert|fix|update|do)\b/i.test(text)
    || isDocumentContinuation(text)
}

export function saveDocument(spec) {
  const id = randomUUID()
  documents.set(id, { spec, createdAt: Date.now() })
  while (documents.size > maxDocuments) documents.delete(documents.keys().next().value)
  return { id, title: spec.title, formats: EXPORT_FORMATS }
}

export function getDocument(id) {
  const entry = documents.get(id)
  if (!entry) return null
  if (Date.now() - entry.createdAt > documentTtlMs) {
    documents.delete(id)
    return null
  }
  return entry
}

export async function exportDocument(id, format) {
  const entry = getDocument(id)
  if (!entry) return null
  if (format === 'txt') {
    return { body: renderText(entry.spec), contentType: 'text/plain; charset=utf-8', filename: `${id}.txt` }
  }
  if (format === 'html') {
    return { body: renderHtml(entry.spec), contentType: 'text/html; charset=utf-8', filename: `${id}.html` }
  }
  if (format === 'md') {
    return { body: renderMarkdown(entry.spec), contentType: 'text/markdown; charset=utf-8', filename: `${id}.md` }
  }
  if (format === 'pdf') {
    let puppeteer
    try {
      puppeteer = await import('puppeteer')
    } catch {
      throw new Error('PDF export requires the optional "puppeteer" package.')
    }
    const installedChromePaths = [
      process.env.CHROME_PATH,
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : '',
      process.env['PROGRAMFILES(X86)'] ? `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe` : '',
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
    ].filter(Boolean)
    const executablePath = installedChromePaths.find((path) => existsSync(path))
    const browser = await puppeteer.default.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    })
    try {
      const page = await browser.newPage()
      await page.setContent(renderHtml(entry.spec), { waitUntil: 'load' })
      const body = await page.pdf({ format: 'A4', printBackground: true })
      return { body, contentType: 'application/pdf', filename: `${id}.pdf` }
    } finally {
      await browser.close()
    }
  }
  if (format === 'docx') {
    let docx
    try {
      docx = await import('docx')
    } catch {
      throw new Error('DOCX export requires the optional "docx" package.')
    }
    const children = []
    for (const block of entry.spec.blocks) {
      if (block.type === 'heading') {
        children.push(new docx.Paragraph({
          text: block.text,
          heading: docx.HeadingLevel[`HEADING_${block.level}`],
        }))
      }
      else if (block.type === 'paragraph' || block.type === 'callout') children.push(new docx.Paragraph(block.text))
      else if (block.type === 'bullets' || block.type === 'numbered') {
        children.push(...block.items.map((item, index) => new docx.Paragraph({
          text: block.type === 'numbered' ? `${index + 1}. ${item}` : item,
          bullet: block.type === 'bullets' ? { level: 0 } : undefined,
        })))
      } else if (block.type === 'divider') children.push(new docx.Paragraph('--------------------------------'))
      else children.push(new docx.Paragraph(block.headers.join(' | ')), ...block.rows.map((row) => new docx.Paragraph(row.join(' | '))))
    }
    const document = new docx.Document({ sections: [{ children }] })
    const body = await docx.Packer.toBuffer(document)
    return { body, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: `${id}.docx` }
  }
  throw new Error(`Unsupported document format: ${format}`)
}
