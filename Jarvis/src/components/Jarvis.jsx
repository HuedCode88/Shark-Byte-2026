import { useSpeech } from "../hooks/useSpeech";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

export default function Jarvis() {
  const { speak, stop: stopSpeaking, speaking } = useSpeech();

  const { start, stop, listening, finalText, interim, error, supported } =
    useSpeechRecognition({
      silenceMs: 2000,
      onFinish: (fullText) => speak(fullText, { rate: 0.95 }), // read it all back
    });

  if (!supported) {
    return <p>Speech recognition isn't supported here. Try Chrome or Edge.</p>;
  }

  function handleMicClick() {
    if (listening) {
      stop(); // finishing manually also triggers the read-back
    } else {
      stopSpeaking(); // cut off any playback before listening again
      start();
    }
  }

  return (
    <div>
      <button onClick={handleMicClick}>
        {listening ? "Done talking" : speaking ? "Speaking…" : "🎤 Start talking"}
      </button>

      {speaking && <button onClick={stopSpeaking}>Stop reading</button>}
      {error && <p style={{ color: "red" }}>Mic error: {error}</p>}

      <div style={{ marginTop: 16, minHeight: 80 }}>
        <p>
          {finalText}
          <span style={{ opacity: 0.5 }}>{interim}</span>
        </p>
      </div>
    </div>
  );
}