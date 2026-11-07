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
