# Jarvis

React chat assistant with optional generative UI. Jarvis answers normal conversation directly and routes complex requests to server-side Swarms orchestration. UI commands are validated before React applies them.

## Run locally

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create a `.env` file in the project root:

   ```env
   SWARMS_API_KEY=your-api-key
   SWARMS_IMAGE_MODEL=your-image-capable-swarms-model
   ```

   `SWARMS_IMAGE_MODEL` is optional and must be an image-capable model actually available
   through your Swarms account. It uses the same `SWARMS_API_KEY`; no separate image-provider
   key is required. Interface requests such as “show me an image of a login screen” use the
   React UI swarm instead. The `.env` file is ignored by Git and loaded only by the server.

3. Start the API bridge:

   ```powershell
   npm run server
   ```

4. In another terminal, start Vite:

   ```powershell
   npm run dev
   ```

The browser uses one HTTP path, `POST /api/chat`. The server chooses a direct assistant request for simple turns and a Swarms orchestration request for complex turns. API keys never reach the browser.

Image generation is a server-side Swarms capability: the image request is routed to the
configured image-capable agent model using the existing Swarms API key.
