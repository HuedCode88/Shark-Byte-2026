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

The browser calls `POST /api/chat`. The fast layer runs local Speaker, Turn-taker, and Emotion reader roles immediately. In the background, the server runs the Thinker, Persona Guardian, Delivery Director, and Initiator through a Swarms `MixtureOfAgents` job, while a separate Memory Keeper job extracts durable facts into server memory. Delivery currently produces text chunks only; ElevenLabs integration is intentionally deferred. The browser polls `GET /api/chat/:jobId` and swaps in the considered answer when it is ready. The fast response still works when the slow layer has no API key; background jobs report that configuration error separately.

Before routing, a Conversation Orchestrator interprets the user's message into a strict intent plan (`answer`, `research`, `research_document`, `create_document`, `edit_document`, or `clarify`). Requests that need current web information, fact-checking, or sources start the research workflow instead of the chat-answer workflow. The chat UI displays the research summary, sources, key points, verified quotes, conflicts, and gaps in the same conversation. Ask to "research [topic] and make it into a document" to automatically create a downloadable sourced report after the research is complete, or use **Create document from research** on any research result. The document preview and export formats are then shown in the same chat message. Research needs both `SWARMS_API_KEY` and `FIRECRAWL_API_KEY`. Deterministic routing handles explicit research requests if the orchestrator is unavailable. This also lets conversational follow-ups such as "make it three pages" operate on the latest document without requiring rigid commands.

Document requests are handled by a separate server-side pipeline. Swarms produces a plain-text DocSpec, which [`documents.js`](./documents.js) validates and stores in memory for one hour (maximum 50 documents). Preview data is available from `GET /api/documents/:id`; exports are generated on demand with `GET /api/documents/:id/export?format=txt|html|md|pdf|docx`. PDF and DOCX exports use the optional `puppeteer` and `docx` packages; PDF export uses `CHROME_PATH` or a locally installed Chrome executable when available. No document files are written to disk by the server.
