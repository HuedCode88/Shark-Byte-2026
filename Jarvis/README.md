# Jarvis Swarms test

Small React chat UI that sends questions to a local server, which forwards them to the hosted Swarms API.

## Run locally

1. Create a `.env` file in the project root:

   ```env
   SWARMS_API_KEY=your-api-key
   FIRECRAWL_API_KEY=your-api-key
   ```

   The `.env` file is ignored by Git and loaded only by the server.

2. Start the API bridge:

   ```powershell
   npm run server
   ```

3. In another terminal, start Vite:

   ```powershell
   npm run dev
   ```

The browser calls `POST /api/chat`. The fast layer runs local Speaker, Turn-taker, and Emotion reader roles immediately. In the background, the server runs the Thinker, Persona Guardian, Delivery Director, and Initiator through a Swarms `MixtureOfAgents` job, while a separate Memory Keeper job extracts durable facts into server memory. Delivery currently produces text chunks only. The browser polls `GET /api/chat/:jobId` and swaps in the considered answer when it is ready. The fast response still works when the slow layer has no API key; background jobs report that configuration error separately.

Before routing, a Conversation Orchestrator interprets the user's message into a strict intent plan (`answer`, `research`, `research_document`, `create_document`, `edit_document`, or `clarify`). Requests that need current web information, fact-checking, or sources start the research workflow instead of the chat-answer or spreadsheet workflow. The chat UI displays the research summary, sources, key points, verified quotes, conflicts, and gaps in the same conversation. Ask to "research [topic] and make it into a document" to automatically create a downloadable sourced report after the research is complete, or use **Create document from research** on any research result. The document preview and export formats are then shown in the same chat message. Research needs both `SWARMS_API_KEY` and `FIRECRAWL_API_KEY`. Facebook and Reddit search results are excluded because they commonly restrict automated page access; other source scrape failures are skipped without failing the whole research job, and an empty search result receives one bounded plain-topic retry. Deterministic routing handles explicit research requests if the orchestrator is unavailable. This also lets conversational follow-ups such as "make it three pages" operate on the latest document without requiring rigid commands.

Document requests are handled by a separate server-side pipeline. Swarms produces a plain-text DocSpec, which [`documents.js`](./documents.js) validates and stores in memory for one hour (maximum 50 documents). Preview data is available from `GET /api/documents/:id`; exports are generated on demand with `GET /api/documents/:id/export?format=txt|html|md|pdf|docx`. PDF and DOCX exports use the optional `puppeteer` and `docx` packages; PDF export uses `CHROME_PATH` or a locally installed Chrome executable when available. No document files are written to disk by the server.

Spreadsheet requests are additive to the document workflow. The orchestrator routes templates, trackers, budgets, Excel files, and CSV requests to [`spreadsheets.js`](./spreadsheets.js). Research spreadsheets run Query Planner → Firecrawl → Research Extractor → DataAnalyst → SheetStructurer; relational requests such as “rates in relation to the economy” are routed to statistical web research, and complex multi-variable or comparative requests activate an edge-case PlannerWorkerSwarm protocol that creates independent evidence lanes before a multi-agent evidence panel reconciles them. Broad qualitative stock requests additionally use a Stock Candidate Finder, Fundamental Context Analyst, and Relevance Auditor panel so Excel tutorials and API documentation do not replace candidate research. Specific quantitative requests retain strict numeric and source validation, while broad qualitative requests may produce sourced names, categories, descriptions, and other explicit findings without requiring numeric observations. Spreadsheet specs are validated server-side, source URLs are checked against the verified dossier, and suspicious numeric values are reported for review. Preview data is available from `GET /api/spreadsheets/:id`; exports use `GET /api/spreadsheets/:id/export?format=xlsx|csv` and accept `sheet=0` for CSV sheet selection. XLSX export uses `exceljs`; CSV export remains available through the same workflow.
