import { useSpeech } from "../hooks/useSpeech";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import SpeechWave from "./SpeechWave";

export default function Jarvis() {
  const { speak, stop: stopSpeaking, speaking, levelRef } = useSpeech();

  const { start, stop, listening, transcribing, finalText, error } =
    useSpeechRecognition({ onFinish: (text) => speak(text) });

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
      <SpeechWave active={speaking} levelRef={levelRef} />

      <button onClick={handleMicClick} disabled={transcribing}>
        {listening
          ? "Done talking"
          : transcribing
          ? "Transcribing…"
          : speaking
          ? "Speaking…"
          : "🎤 Start talking"}
      </button>

      {speaking && <button onClick={stopSpeaking}>Stop reading</button>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      <div style={{ marginTop: 16, minHeight: 80 }}>
        <p>{finalText}</p>
      </div>
    </div>
  );
}