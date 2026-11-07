import { useState, useEffect, useCallback, useRef } from "react";

export function useSpeech() {
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const utteranceRef = useRef(null); // prevents garbage collection bug in some browsers

  // Voices load asynchronously, so listen for them
  useEffect(() => {
    if (!supported) return;

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel(); // stop speech on unmount
    };
  }, [supported]);

  const speak = useCallback(
    (text, { voice, rate = 1, pitch = 1, volume = 1 } = {}) => {
      if (!supported || !text) return;

      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.rate = rate;     // 0.1 to 10
      utterance.pitch = pitch;   // 0 to 2
      utterance.volume = volume; // 0 to 1

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [supported]
  );

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { speak, stop, speaking, voices, supported };
}