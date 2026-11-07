import { useState, useEffect, useRef, useCallback } from "react";

export function useSpeechRecognition({
  lang = "en-US",
  silenceMs = 2000, // auto-finish after this much silence
  onFinish,         // called with the full transcript when the user is done
} = {}) {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState(""); // confirmed words
  const [interim, setInterim] = useState("");     // words still being recognized
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const finalRef = useRef("");   // accumulates the whole session
  const timerRef = useRef(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const SpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = Boolean(SpeechRecognition);

  useEffect(() => {
    if (!supported) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;      // keep listening across pauses
    recognition.interimResults = true;  // stream partial words live

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalRef.current += result[0].transcript.trim() + " ";
        } else {
          interimText += result[0].transcript;
        }
      }

      setFinalText(finalRef.current);
      setInterim(interimText);

      // Restart the silence timer every time we hear something
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => recognition.stop(), silenceMs);
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(event.error);
      }
    };

    recognition.onend = () => {
      clearTimeout(timerRef.current);
      setListening(false);
      setInterim("");

      const full = finalRef.current.trim();
      if (full) onFinishRef.current?.(full);
    };

    recognitionRef.current = recognition;

    return () => {
      clearTimeout(timerRef.current);
      recognition.abort();
    };
  }, [SpeechRecognition, supported, lang, silenceMs]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    finalRef.current = "";
    setFinalText("");
    setInterim("");
    try {
      recognitionRef.current.start();
    } catch {
      // already started; ignore
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop(); // triggers onend, which fires onFinish
  }, []);

  return { start, stop, listening, finalText, interim, error, supported };
}