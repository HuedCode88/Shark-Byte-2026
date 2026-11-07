# Jarvis Swarms test

Small React chat UI that sends questions to a local server, which forwards them to the hosted Swarms API.

## Run locally

1. Create a `.env` file in the project root:

   ```env
   SWARMS_API_KEY=your-api-key
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

Before routing, a Conversation Orchestrator interprets the user's message into a strict intent plan (`answer`, `create_document`, `edit_document`, or `clarify`). The plan is passed to the specialized agents, with deterministic routing as a fallback if the orchestrator is unavailable. This lets conversational follow-ups such as "make it three pages" operate on the latest document without requiring rigid commands.

Document requests are handled by a separate server-side pipeline. Swarms produces a plain-text DocSpec, which [`documents.js`](./documents.js) validates and stores in memory for one hour (maximum 50 documents). Preview data is available from `GET /api/documents/:id`; exports are generated on demand with `GET /api/documents/:id/export?format=txt|html|md|pdf|docx`. PDF and DOCX exports use the optional `puppeteer` and `docx` packages; PDF export uses `CHROME_PATH` or a locally installed Chrome executable when available. No document files are written to disk by the server.
