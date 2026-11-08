const SPREADSHEET_DELIVERABLE = /\b(?:make|create|build|generate|prepare|put together|produce|give me|get me|export|turn)\b[^.?!\n]{0,80}\b(?:spreadsheet|excel|xlsx|csv|sheet)\b/i
const DOCUMENT_NOUN = /\b(?:document|doc|docx|pdf|word\s+file|report|memo|letter|essay|write-?up)\b/i
const EXPORT_WORD = /\b(?:download\w*|save|export|file|printable|print)\b/i
const DOCUMENT_INTENTS = new Set(['create_document', 'edit_document', 'research_document'])
const OVERRIDABLE_FOR_SPREADSHEET = new Set([
  ...DOCUMENT_INTENTS,
  'answer',
  'clarify',
  'research',
])

export function isExplicitSpreadsheetRequest(question) {
  return SPREADSHEET_DELIVERABLE.test(String(question || ''))
}

export function mentionsDocumentNoun(question) {
  return DOCUMENT_NOUN.test(String(question || ''))
}

export function normalizeArtifactIntent(interpretation, question, flags = {}) {
  if (flags.calendarRequest || !flags.wantsSpreadsheet || !isExplicitSpreadsheetRequest(question)) {
    return interpretation
  }
  if (mentionsDocumentNoun(question) && DOCUMENT_INTENTS.has(interpretation.intent)) {
    return interpretation
  }
  if (!OVERRIDABLE_FOR_SPREADSHEET.has(interpretation.intent)) return interpretation
  return {
    ...interpretation,
    intent: flags.researchBackedSpreadsheet ? 'research_spreadsheet' : 'create_spreadsheet',
    format: 'xlsx',
  }
}

export function deriveArtifactFlags(input) {
  const {
    question,
    intent,
    route,
    signals,
    hasDocument,
    previousKind,
    directProgramming,
    legacyFromConversation,
    researchDossierAvailable,
  } = input
  const spreadsheetFamily = Boolean(signals.wantsSpreadsheet)
    && isExplicitSpreadsheetRequest(question)
    && !mentionsDocumentNoun(question)
  const docAllowed = !spreadsheetFamily
  const routeFromConversation = route?.source === 'latest_response' && route?.action === 'create'
  const legacyOk = Boolean(legacyFromConversation)
    && (mentionsDocumentNoun(question) || EXPORT_WORD.test(question))
  const createDocumentFromConversation = docAllowed
    && Boolean(signals.wantsDocument)
    && (routeFromConversation || legacyOk)
  const explicitNewDocument = Boolean(signals.wantsDocument) && !signals.contextFollowUp
  const refersToDocument = previousKind === 'document'
    || mentionsDocumentNoun(question)
    || route?.source === 'existing_document'
  const editingDocument = Boolean(
    hasDocument
    && docAllowed
    && !directProgramming
    && !createDocumentFromConversation
    && !explicitNewDocument
    && refersToDocument
    && (route?.source === 'existing_document'
      || intent === 'edit_document'
      || signals.wantsDocumentEdit
      || signals.contextFollowUp),
  )
  const documentRequested = docAllowed
    && (Boolean(signals.wantsDocument)
      || (intent === 'research_document' && researchDossierAvailable === true))
  const creatingDocument = documentRequested
    && (explicitNewDocument
      || createDocumentFromConversation
      || intent === 'create_document'
      || (intent === 'research_document' && researchDossierAvailable === true))
  const researchDocument = documentRequested && intent === 'research_document'

  return {
    spreadsheetFamily,
    createDocumentFromConversation,
    explicitNewDocument,
    editingDocument,
    documentRequested,
    creatingDocument,
    researchDocument,
  }
}
