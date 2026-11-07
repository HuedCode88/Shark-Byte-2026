import { useState, useRef, useCallback, useEffect } from "react";

export function useSpeechRecognition({
  silenceMs = 2000,
  silenceThreshold = 0.015, // tune for your mic
  onFinish,
} = {}) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = useCallback(async () => {
    setFinalText("");
    setError(null);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(e.name);
      return;
    }

    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorderRef.current = recorder;
    let heardSpeech = false;
    let lastSound = Date.now();
    const startedAt = Date.now();

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    timerRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += ((s - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / samples.length);

      if (rms > silenceThreshold) {
        heardSpeech = true;
        lastSound = Date.now();
      }
      const silentTooLong = heardSpeech && Date.now() - lastSound > silenceMs;
      const gaveUp = !heardSpeech && Date.now() - startedAt > silenceMs + 4000;
      if ((silentTooLong || gaveUp) && recorder.state === "recording") {
        recorder.stop();
      }
    }, 100);

    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    recorder.onstop = async () => {
      clearInterval(timerRef.current);
      stream.getTracks().forEach((t) => t.stop()); // release the mic
      ctx.close();
      setListening(false);

      if (!heardSpeech) return; // don't pay to transcribe silence

      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", new Blob(chunks, { type: recorder.mimeType }));
        const r = await fetch("/api/stt", { method: "POST", body: form });
        if (!r.ok) throw new Error("Transcription failed");
        const { text } = await r.json();
        setFinalText(text);
        if (text) onFinishRef.current?.(text);
      } catch (e) {
        setError(e.message);
      } finally {
        setTranscribing(false);
      }
    };

    recorder.start();
    setListening(true);
  }, [silenceMs, silenceThreshold]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  return {
    start, stop, listening, transcribing,
    finalText, interim: "", error, supported: true,
  };
}