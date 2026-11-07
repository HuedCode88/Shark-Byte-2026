import { randomUUID } from 'node:crypto'

export const SPREADSHEET_EXPORT_FORMATS = ['xlsx', 'csv']
const spreadsheets = new Map()
const spreadsheetTtlMs = 60 * 60 * 1000
const maxSpreadsheets = 50
const maxSheets = 12
const maxColumns = 50
const maxRows = 2000

export const SHEET_SPEC_PROMPT = `Return JSON only with this shape:
{"title":"...","sheets":[{"name":"...","columns":[{"key":"...","label":"...","type":"text|number|integer|percent|currency|date|boolean|url"}],"rows":[{}]}]}
Use unique safe sheet names, stable column keys, and only the listed types. Keep all values exactly as drafted. Never include formulas, HTML, markdown, or extra fields. Keep source URLs in a column named "source_url" or an equivalent URL column when sources are supplied.`

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function safeSheetName(value, index) {
  const name = cleanText(value, `Sheet ${index + 1}`)
    .replace(/[\\/*?:[\]]/g, '')
    .slice(0, 31)
    .trim()
  return name || `Sheet ${index + 1}`
}

function uniqueName(name, used) {
  let candidate = name
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const tail = ` ${suffix}`
    candidate = `${name.slice(0, 31 - tail.length)}${tail}`
    suffix += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function safeKey(value, index) {
  const key = cleanText(value, `column_${index + 1}`)
    .replace(/[^\w-]/g, '_')
    .replace(/^(\d)/, '_$1')
    .slice(0, 80)
  return key || `column_${index + 1}`
}

function normalizeType(value) {
  const type = cleanText(value, 'text').toLowerCase()
  return new Set(['text', 'number', 'integer', 'percent', 'currency', 'date', 'boolean', 'url']).has(type)
    ? type
    : 'text'
}

function sanitizeValue(value, type) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string' && value.trim().startsWith('=')) return ''
  if (type === 'boolean') return typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true'
  if (['number', 'integer', 'percent', 'currency'].includes(type)) {
    const number = typeof value === 'number' ? value : Number(String(value).replace(/[$,%\s,]/g, ''))
    return Number.isFinite(number) ? (type === 'integer' ? Math.trunc(number) : number) : ''
  }
  return String(value).slice(0, 2000)
}

function normalizeSpec(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Spreadsheet output must be a JSON object.'], warnings: [] }
  }
  const errors = []
  const warnings = []
  const title = cleanText(raw.title, 'Spreadsheet').slice(0, 200)
  const inputSheets = Array.isArray(raw.sheets) ? raw.sheets.slice(0, maxSheets) : []
  if (!inputSheets.length) errors.push('At least one sheet is required.')
  if (Array.isArray(raw.sheets) && raw.sheets.length > maxSheets) warnings.push(`Only the first ${maxSheets} sheets were kept.`)

  const usedNames = new Set()
  const sheets = inputSheets.map((input, sheetIndex) => {
    const name = uniqueName(safeSheetName(input?.name, sheetIndex), usedNames)
    const inputColumns = Array.isArray(input?.columns) ? input.columns.slice(0, maxColumns) : []
    const usedKeys = new Set()
    const columns = inputColumns.map((column, columnIndex) => {
      let key = safeKey(column?.key || column?.label, columnIndex)
      let suffix = 2
      while (usedKeys.has(key.toLowerCase())) key = `${safeKey(column?.key || column?.label, columnIndex)}_${suffix++}`
      usedKeys.add(key.toLowerCase())
      return {
        key,
        label: cleanText(column?.label, key).slice(0, 120),
        type: normalizeType(column?.type),
      }
    })
    if (!columns.length) errors.push(`Sheet "${name}" must have at least one column.`)
    const rows = Array.isArray(input?.rows) ? input.rows.slice(0, maxRows) : []
    if (Array.isArray(input?.rows) && input.rows.length > maxRows) warnings.push(`Sheet "${name}" was capped at ${maxRows} rows.`)
    return {
      name,
      columns,
      rows: rows.map((row) => {
        const source = row && typeof row === 'object' && !Array.isArray(row) ? row : {}
        return Object.fromEntries(columns.map((column) => [
          column.key,
          sanitizeValue(source[column.key], column.type),
        ]))
      }),
    }
  })

  if (errors.length) return { ok: false, errors, warnings }
  return { ok: true, spec: { title, sheets }, errors: [], warnings }
}

export function parseSheetSpec(rawOutput, options = {}) {
  const cleaned = String(rawOutput || '').replace(/^```(?:json)?\s*|\s*```$/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, errors: ['No spreadsheet JSON object was found.'], warnings: [] }
  try {
    return normalizeSpec(JSON.parse(cleaned.slice(start, end + 1)), options)
  } catch (error) {
    return { ok: false, errors: [`Spreadsheet JSON is invalid: ${error.message}`], warnings: [] }
  }
}

function dossierText(dossier) {
  const parts = [dossier?.summary]
  for (const source of Array.isArray(dossier?.sources) ? dossier.sources : []) {
    parts.push(source?.title, source?.published, source?.credibility_note)
    parts.push(...(Array.isArray(source?.key_points) ? source.key_points : []))
    parts.push(...(Array.isArray(source?.quotes) ? source.quotes : []))
  }
  return parts.filter((value) => typeof value === 'string').join(' ').toLowerCase()
}

function numberAppears(number, text) {
  const raw = String(number)
  const variants = new Set([raw, raw.replace(/\.0+$/, ''), raw.replace('.', ',')])
  if (Number.isFinite(Number(number))) {
    variants.add(Number(number).toLocaleString('en-US', { maximumFractionDigits: 6 }))
    variants.add(Number(number).toLocaleString('en-US', { maximumFractionDigits: 6 }).replace(/,/g, ''))
  }
  return [...variants].some((variant) => text.includes(variant.toLowerCase()))
}

export function applyDossier(spec, dossier) {
  const validSources = new Set(
    (Array.isArray(dossier?.sources) ? dossier.sources : [])
      .map((source) => source?.url)
      .filter((url) => typeof url === 'string' && url),
  )
  const text = dossierText(dossier)
  let flaggedCells = 0
  let clearedSourceUrls = 0
  const reviewFlags = []
  const sheets = spec.sheets.map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row, rowIndex) => {
      const next = { ...row }
      sheet.columns.forEach((column) => {
        const value = next[column.key]
        if (column.type === 'url' || column.key.toLowerCase().includes('source')) {
          if (value && !validSources.has(value)) {
            next[column.key] = ''
            clearedSourceUrls += 1
          }
        }
        if (['number', 'integer', 'percent', 'currency'].includes(column.type) && value !== '' && !numberAppears(value, text)) {
          flaggedCells += 1
          reviewFlags.push(`${sheet.name}:${rowIndex}:${column.key}`)
        }
      })
      return next
    }),
  }))
  const sourceSheet = {
    name: uniqueName('Sources', new Set(sheets.map((sheet) => sheet.name.toLowerCase()))),
    columns: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'published', label: 'Published', type: 'date' },
    ],
    rows: (Array.isArray(dossier?.sources) ? dossier.sources : []).map((source) => ({
      title: cleanText(source?.title),
      url: cleanText(source?.url),
      published: cleanText(source?.published),
    })),
  }
  if (sourceSheet.rows.length) sheets.push(sourceSheet)
  return { spec: { ...spec, sheets, reviewFlags }, flaggedCells, clearedSourceUrls }
}

function prune() {
  const cutoff = Date.now() - spreadsheetTtlMs
  for (const [id, entry] of spreadsheets) if (entry.createdAt < cutoff) spreadsheets.delete(id)
  while (spreadsheets.size > maxSpreadsheets) spreadsheets.delete(spreadsheets.keys().next().value)
}

export function saveSpreadsheet(spec, review = {}) {
  prune()
  const id = randomUUID()
  const entry = {
    id,
    title: spec.title,
    spec,
    flaggedCells: review.flaggedCells || 0,
    clearedSourceUrls: review.clearedSourceUrls || 0,
    createdAt: Date.now(),
  }
  spreadsheets.set(id, entry)
  return entry
}

export function getSpreadsheet(id) {
  prune()
  return spreadsheets.get(id) || null
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderSheetHtml(spec) {
  const sections = spec.sheets.map((sheet) => {
    const headers = sheet.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')
    const rows = sheet.rows.map((row, rowIndex) => {
      const cells = sheet.columns.map((column) => {
        const value = row[column.key]
        const flagged = Array.isArray(spec.reviewFlags)
          && spec.reviewFlags.includes(`${sheet.name}:${rowIndex}:${column.key}`)
        return `<td${flagged ? ' class="flagged"' : ''}>${escapeHtml(value)}</td>`
      }).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    return `<section><h2>${escapeHtml(sheet.name)}</h2><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></section>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px Arial,sans-serif;color:#17302d;background:#fff;padding:20px}section{margin-bottom:28px}h1{font-size:22px}h2{font-size:17px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #cbd9cf;padding:7px;text-align:left;vertical-align:top}th{background:#e8f1e8}td.flagged{background:#fff0a8}
</style></head><body><h1>${escapeHtml(spec.title)}</h1>${sections}</body></html>`
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function renderCsv(spec, sheetIndex = 0) {
  const sheet = spec.sheets[sheetIndex]
  if (!sheet) return null
  const lines = [
    sheet.columns.map((column) => csvCell(column.label)).join(','),
    ...sheet.rows.map((row) => sheet.columns.map((column) => csvCell(row[column.key])).join(',')),
  ]
  return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8')
}

export async function exportSpreadsheet(id, format, sheetIndex = 0) {
  const entry = getSpreadsheet(id)
  if (!entry || !SPREADSHEET_EXPORT_FORMATS.includes(format)) return null
  const baseName = entry.spec.title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'spreadsheet'
  if (format === 'csv') {
    const body = renderCsv(entry.spec, sheetIndex)
    return body ? { body, contentType: 'text/csv; charset=utf-8', filename: `${baseName}.csv` } : null
  }
  let ExcelJS
  try {
    ExcelJS = (await import('exceljs')).default
  } catch {
    throw new Error('XLSX export requires the exceljs package. Run npm install.')
  }
  const workbook = new ExcelJS.Workbook()
  for (const sheet of entry.spec.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name)
    worksheet.columns = sheet.columns.map((column) => ({ header: column.label, key: column.key }))
    for (const row of sheet.rows) worksheet.addRow(row)
    worksheet.getRow(1).font = { bold: true }
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]
    worksheet.columns.forEach((column) => { column.width = Math.min(42, Math.max(12, String(column.header || '').length + 3)) })
  }
  return {
    body: Buffer.from(await workbook.xlsx.writeBuffer()),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${baseName}.xlsx`,
  }
}

export function wantsSpreadsheet(question) {
  return /\b(spreadsheet|excel|xlsx|csv|worksheet|workbook|table|tracker|budget|planner)\b/i.test(question)
}

export function wantsSpreadsheetEdit(question) {
  return /\b(add|remove|delete|rename|sort|filter|change|update|edit|reorder)\b.{0,60}\b(column|row|sheet|cell|spreadsheet|table)\b/i.test(question)
    || /\b(column|row|sheet|cell|spreadsheet|table)\b.{0,60}\b(add|remove|delete|rename|sort|filter|change|update|edit|reorder)\b/i.test(question)
}
