# Jarvis: Swarms + ElevenLabs

Voice assistant flow: browser recording -> ElevenLabs speech-to-text -> Swarms answer -> ElevenLabs text-to-speech.

## Run locally

1. Create a `.env` file in the project root:

   ```env
   SWARMS_API_KEY=your-api-key
   ELEVENLABS_API_KEY=your-api-key
   ELEVENLABS_VOICE_ID=your-voice-id
   ```

   The `.env` file is ignored by Git and loaded only by the server.
   Optional model overrides are `ELEVENLABS_STT_MODEL` (defaults to `scribe_v1`)
   and `ELEVENLABS_TTS_MODEL` (defaults to `eleven_multilingual_v2`).

2. Start the API bridge:

   ```powershell
   npm run server
   ```

3. In another terminal, start Vite:

   ```powershell
   npm run dev
   ```

The browser sends recordings to `POST /api/stt` and speech text to `POST /api/chat`;
the recognized Swarms answer is sent to `POST /api/tts`. API keys stay on the server.
