import { useState } from "react";
import { useSpeech } from "../hooks/useSpeech";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import SpeechWave from "./SpeechWave";

export default function Jarvis() {
  const { speak, stop: stopSpeaking, speaking, levelRef } = useSpeech();
  const [answer, setAnswer] = useState("");
  const [thinking, setThinking] = useState(false);
  const [requestError, setRequestError] = useState(null);

  const { start, stop, listening, transcribing, finalText, error } =
    useSpeechRecognition({
      onFinish: async (text) => {
        setThinking(true);
        setRequestError(null);
        setAnswer("");
        try {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: text }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(response.status === 400
              ? "Can you repeat that please?"
              : result.error || "The assistant request failed.");
          }
          setAnswer(result.output);
          speak(result.output);
        } catch (requestError) {
          setRequestError(requestError.message);
        } finally {
          setThinking(false);
        }
      },
    });

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

      <button onClick={handleMicClick} disabled={transcribing || thinking}>
        {listening
          ? "Done talking"
          : transcribing
          ? "Transcribing…"
          : thinking
          ? "Thinking…"
          : speaking
          ? "Speaking…"
          : "🎤 Start talking"}
      </button>

      {speaking && <button onClick={stopSpeaking}>Stop reading</button>}
      {(error || requestError) && (
        <p style={{ color: "red" }}>Error: {error || requestError}</p>
      )}

      <div style={{ marginTop: 16, minHeight: 80 }}>
        {finalText && <p><strong>You:</strong> {finalText}</p>}
        {answer && <p><strong>Jarvis:</strong> {answer}</p>}
      </div>
    </div>
  );
}