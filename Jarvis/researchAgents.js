function cleanSources(value) {
  return Array.isArray(value)
    ? value.filter((source) => typeof source === 'string' && source.trim())
    : []
}

function parseObject(getOutput, result) {
  const raw = getOutput(result)
  if (!raw) throw new Error('Research agent returned no output.')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Research agent returned invalid JSON.')
  return JSON.parse(raw.slice(start, end + 1))
}

function safeEndpoint(url, sourceUrls) {
  try {
    const candidate = new URL(url)
    if (!['http:', 'https:'].includes(candidate.protocol)) return null
    if (candidate.username || candidate.password) return null
    const allowed = sourceUrls.some((sourceUrl) => {
      try {
        const source = new URL(sourceUrl)
        return candidate.hostname === source.hostname
          || candidate.hostname.endsWith(`.${source.hostname}`)
          || source.hostname.endsWith(`.${candidate.hostname}`)
      } catch {
        return false
      }
    })
    return allowed ? candidate.href : null
  } catch {
    return null
  }
}

export async function fetchResearchEndpoints({
  topic,
  pages,
  callSwarms,
  getOutput,
  modelName,
}) {
  const sourceUrls = [...pages.keys()]
  const pageBundle = [...pages.entries()]
    .map(([url, page]) => `SOURCE: ${url}\nTITLE: ${page.title}\n${page.text.slice(0, 4000)}`)
    .join('\n\n')
  const result = await callSwarms(
    'Research Data Endpoint Finder',
    `Find direct public machine-readable data endpoints that can answer the exact request.
Return ONLY JSON:
{"endpoints":[{"url":"","source_url":"","reason":""}]}

User request: ${topic}
Rules:
- Prefer a direct CSV or JSON endpoint over documentation or a landing page.
- Preserve the requested subject, geography, measurement, date range, and units.
- Use only public HTTP(S) endpoints on the same domain or a subdomain of a supplied source.
- Do not invent values. Do not return API documentation URLs unless they directly return data.
- Return no endpoint when the supplied sources do not support one.
${pageBundle}`,
    [{
      agent_name: 'DataEndpointFinder',
      system_prompt: 'Find safe, public, machine-readable data endpoints. Return JSON only.',
      model_name: modelName,
    }],
  )
  const parsed = parseObject(getOutput, result)
  const endpoints = []
  for (const candidate of Array.isArray(parsed.endpoints) ? parsed.endpoints : []) {
    const url = safeEndpoint(candidate?.url, sourceUrls)
    if (!url || endpoints.some((item) => item.url === url)) continue
    endpoints.push({ url, source_url: candidate.source_url || '', reason: candidate.reason || '' })
  }
  const fetched = new Map()
  for (const endpoint of endpoints.slice(0, 3)) {
    try {
      const response = await fetch(endpoint.url, {
        headers: { Accept: 'application/json, text/csv, text/plain' },
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) continue
      const text = (await response.text()).slice(0, 50000)
      if (!text.trim()) continue
      fetched.set(endpoint.url, {
        title: `Data endpoint for ${topic}`,
        published: '',
        text,
      })
    } catch {
      continue
    }
  }
  return fetched
}

export async function judgeResearchSources({
  topic,
  pages,
  callSwarms,
  getOutput,
  modelName,
}) {
  const pageBundle = [...pages.entries()]
    .map(([url, page]) => `URL: ${url}\nTITLE: ${page.title}\n${page.text.slice(0, 5000)}`)
    .join('\n\n')
  const result = await callSwarms(
    'Research Source Judge',
    `Judge which supplied pages are relevant to the user's exact research request.
Return ONLY JSON:
{"sources":[{"url":"","relevant":true,"matches_subject":true,"matches_measure":true,"covers_requested_period":true,"reason":""}]}

User request: ${topic}
Rules:
- A page is relevant only when it supports the requested subject, geography, measurement, and deliverable.
- Shared years, generic statistics, or a broad topic word are not sufficient.
- Reject unrelated economic, financial, or background pages for a weather, sports, delivery, or other measurement request.
- Do not infer values or repair missing evidence.
Pages:
${pageBundle}`,
    [{
      agent_name: 'SourceJudge',
      system_prompt: 'Classify source relevance against the exact request. Return JSON only.',
      model_name: modelName,
    }],
  )
  const parsed = parseObject(getOutput, result)
  const decisions = new Map(
    (Array.isArray(parsed.sources) ? parsed.sources : [])
      .filter((source) => typeof source?.url === 'string')
      .map((source) => [source.url, source]),
  )
  const acceptedPages = new Map()
  for (const [url, page] of pages) {
    if (decisions.get(url)?.relevant === true) acceptedPages.set(url, page)
  }
  return {
    pages: acceptedPages,
    rejected: [...pages.keys()].filter((url) => !acceptedPages.has(url)),
    reasons: [...decisions.values()]
      .filter((source) => source.relevant !== true && typeof source.reason === 'string')
      .map((source) => source.reason),
  }
}

export async function critiqueResearchGaps({
  topic,
  dossier,
  profile,
  callSwarms,
  getOutput,
  modelName,
}) {
  const result = await callSwarms(
    'Research Gap Critic',
    `Identify missing evidence in this research dossier.
Return ONLY JSON:
{"complete":true,"missing":[""],"next_searches":[""]}

User request: ${topic}
Deterministic observation profile:
${JSON.stringify(profile)}
Dossier:
${JSON.stringify(dossier)}
Rules:
- Check subject, geography, measurement, and every explicitly requested period.
- Do not require periods the user did not request.
- Do not invent values; list missing periods or mismatches only.`,
    [{
      agent_name: 'GapCritic',
      system_prompt: 'Audit research coverage and propose targeted searches. Return JSON only.',
      model_name: modelName,
    }],
  )
  const parsed = parseObject(getOutput, result)
  return {
    complete: parsed.complete === true,
    missing: cleanSources(parsed.missing),
    nextSearches: cleanSources(parsed.next_searches),
  }
}
