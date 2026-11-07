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

The browser calls `POST /api/chat`; the server sends a `MixtureOfAgents` request to `https://api.swarms.world/v1/swarm/completions`.
