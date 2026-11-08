const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const PERIOD_RE = new RegExp(`(?:\\b(?:${MONTHS})\\.?\\s+)?\\b((?:19|20)\\d{2})\\b`, 'gi')
const NUMBER_RE = /(?<![\w.,])([$€£¥]\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d])/g
const MAGNITUDE = /^\s*(thousand|million|billion|trillion|k|m|bn|b|mm)\b/i
const UNIT_STOP = new Set(['in', 'of', 'by', 'on', 'at', 'for', 'was', 'were', 'is', 'are', 'from', 'to', 'and', 'or', 'with', 'that', 'which', 'as', 'during', 'since', 'than', 'the', 'a', 'an', 'it', 'its', 'but', 'while', 'when', 'after', 'before'])
const STOPWORDS = new Set('a an and are as at be by can do for from has have how in into is it its me my of on or our per the their there these this those to was we were what when where which who why will with you your about make made please spreadsheet excel sheet csv xlsx file table data show give list find average'.split(' '))

function stem(word) {
  if (word.length <= 4) return word.replace(/s$/, '')
  return word.replace(/(ing|ed|es|s)$/, '').replace(/e$/, '')
}

function topicWords(text) {
  const out = new Set()
  for (const raw of String(text || '').toLowerCase().match(/[a-z][a-z'-]*/g) || []) {
    const word = raw.replace(/'s$/, '')
    if (/^(?:19|20)\d{2}$/.test(word)) continue
    if (word.length < 3 || STOPWORDS.has(word)) continue
    out.add(stem(word))
  }
  return out
}

function requestedRange(topic) {
  const range = String(topic || '').match(/\b((?:19|20)\d{2})\s*(?:[-–—]|to|through|until)\s*((?:19|20)\d{2})\b/i)
  if (range) return { from: Math.min(Number(range[1]), Number(range[2])), to: Math.max(Number(range[1]), Number(range[2])) }
  return null
}

function nearestPeriod(entry, numberStart, numberEnd) {
  let best = null
  for (const match of entry.matchAll(PERIOD_RE)) {
    const yearStart = match.index
    const yearEnd = match.index + match[0].length
    if (yearStart < numberEnd && yearEnd > numberStart) continue
    const distance = yearStart >= numberEnd ? yearStart - numberEnd - 6 : numberStart - yearEnd
    if (!best || distance < best.distance) best = { label: match[0].trim(), year: Number(match[1]), distance }
  }
  return best
}

function findObservations(entry) {
  const text = String(entry || '')
  const found = []
  for (const match of text.matchAll(NUMBER_RE)) {
    const currency = (match[1] || '').trim()
    const raw = match[2]
    const start = match.index + (match[1] ? match[1].length : 0)
    const end = match.index + match[0].length
    const after = text.slice(end)
    if (/^,\d{1,2}(?!\d)/.test(after)) continue
    if (/^\s*[/]\s*\d/.test(after) || /[/]\s*$/.test(text.slice(0, start))) continue
    const value = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(value)) continue

    let rest = after
    let unit = ''
    const isPercent = /^\s*(?:%|percent\b|per\s*cent\b)/i.test(rest)
    const isDegree = /^\s*°\s*[CFK]?/i.exec(rest)
    if (isPercent) {
      unit = '%'
      rest = rest.replace(/^\s*(?:%|percent\b|per\s*cent\b)/i, '')
    } else if (isDegree) {
      unit = isDegree[0].replace(/\s+/g, '')
      rest = rest.slice(isDegree[0].length)
    } else {
      const magnitude = rest.match(MAGNITUDE)
      if (magnitude) {
        unit = magnitude[1].toLowerCase()
        rest = rest.slice(magnitude[0].length)
      }
      const tokens = rest.match(/^(?:\s+[A-Za-z][A-Za-z/-]*){0,4}/)?.[0].trim().split(/\s+/).filter(Boolean) || []
      for (const token of tokens) {
        const lower = token.toLowerCase()
        if (UNIT_STOP.has(lower)) break
        unit = [unit, token].filter(Boolean).join(' ')
        if (unit.split(/\s+/).length >= 3) break
      }
    }

    if (/^(?:19|20)\d{2}$/.test(raw) && !currency && unit !== '%' && !/^°/.test(unit) && !MAGNITUDE.test(after)) {
      const before = text.slice(0, start)
      const introducedAsDate = /(?:\b(?:in|during|since|until|from|to|through|by|for|the|of|fiscal|fy|year|between|and|q[1-4])\s*|[-–—(]\s*)$/i.test(before)
      if (introducedAsDate || !unit) continue
    }
    if (!currency && !unit && !/[.,]/.test(raw) && value < 10) continue

    const period = nearestPeriod(text, start, end)
    found.push({
      value,
      raw,
      unit: [currency, unit].filter(Boolean).join(' ').trim(),
      period: period?.label || '',
      year: period?.year ?? null,
      entry: text,
    })
  }
  return found
}

function dossierObservations(dossier, topic = '') {
  const sources = []
  for (const source of Array.isArray(dossier?.sources) ? dossier.sources : []) {
    if (typeof source?.url !== 'string' || !source.url) continue
    const entries = [
      source?.summary,
      source?.description,
      ...(Array.isArray(source?.key_points) ? source.key_points : []),
      ...(Array.isArray(source?.quotes) ? source.quotes : []),
      ...(Array.isArray(source?.findings) ? source.findings : []),
    ].filter((value) => typeof value === 'string' && value.trim())
    const rows = []
    const seen = new Set()
    for (const entry of entries) {
      for (const observation of findObservations(entry)) {
        const key = `${observation.raw}|${observation.unit}|${observation.period}|${entry.slice(0, 60)}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({ ...observation, source_url: source.url })
      }
    }
    if (rows.length) sources.push({ source, entries, rows })
  }

  let kept = sources
  const words = topicWords(topic)
  if (words.size && kept.length) {
    const related = kept.filter(({ source, entries }) => {
      const context = topicWords(`${source.title || ''} ${entries.join(' ')}`)
      return [...words].some((word) => context.has(word))
    })
    kept = related
  }
  let rows = kept.flatMap((item) => item.rows)
  const range = requestedRange(topic)
  if (range && rows.length) {
    const datedInRange = rows.filter((row) => row.year !== null && row.year >= range.from && row.year <= range.to)
    // A ranged quantitative request cannot be satisfied by undated metadata such as
    // an API's measurement height or a source publication year.
    if (datedInRange.length) rows = datedInRange
    else rows = []
  }
  return rows
}

export function observationProfile(dossier, topic = '') {
  const rows = dossierObservations(dossier, topic)
  return {
    numericObservations: rows.length,
    observedYears: [...new Set(rows.map((row) => row.year).filter((year) => year !== null))].sort((a, b) => a - b),
    requestedRange: (() => {
      const range = requestedRange(topic)
      return range ? `${range.from}-${range.to}` : ''
    })(),
  }
}

export function buildObservationSheet(topic, dossier) {
  const rows = dossierObservations(dossier, topic).map((row) => ({
    observation: row.entry.slice(0, 2000),
    value: row.value,
    unit: row.unit,
    period: row.period,
    source_url: row.source_url,
  }))
  if (!rows.length) return null
  return {
    title: `${topic} (Verified Observations)`,
    sheets: [{
      name: 'Data',
      columns: [
        { key: 'observation', label: 'Observation', type: 'text' },
        { key: 'value', label: 'Value', type: 'number' },
        { key: 'unit', label: 'Unit', type: 'text' },
        { key: 'period', label: 'Period', type: 'text' },
        { key: 'source_url', label: 'Source URL', type: 'url' },
      ],
      rows,
    }],
  }
}
