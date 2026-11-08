import { useState, useRef, useCallback, useEffect } from "react";

export function useSpeechRecognition({
  silenceMs = 1200,
  silenceThreshold = 0.015, // tune for your mic
  onFinish,
  onError,
  levelRef,
} = {}) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const onFinishRef = useRef(onFinish);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onFinishRef.current = onFinish;
    onErrorRef.current = onError;
  }, [onFinish, onError]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = useCallback(async () => {
    setFinalText("");
    setError(null);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(e.name);
      onErrorRef.current?.(e.name);
      return;
    }

    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorderRef.current = recorder;
    let heardSpeech = false;
    let lastSound = Date.now();

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
      if (levelRef) levelRef.current = Math.min(1, rms * 8);

      if (rms > silenceThreshold) {
        heardSpeech = true;
        lastSound = Date.now();
      }
      const silentTooLong = heardSpeech && Date.now() - lastSound > silenceMs;
      if (silentTooLong && recorder.state === "recording") {
        recorder.stop();
      }
    }, 100);

    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      chunks.push(e.data);
      if (!heardSpeech && chunks.length > 2) chunks.shift();
    };

    recorder.onstop = async () => {
      clearInterval(timerRef.current);
      if (levelRef) levelRef.current = 0;
      stream.getTracks().forEach((t) => t.stop()); // release the mic
      ctx.close();
      setListening(false);

      if (!heardSpeech) return; // don't pay to transcribe silence

      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", new Blob(chunks, { type: recorder.mimeType }), "recording.webm");
        const r = await fetch("/api/stt", { method: "POST", body: form });
        const result = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(r.status === 400
            ? "Can you repeat that please?"
            : typeof result.error === "string" ? result.error : `Transcription failed (${r.status})`);
        }
        const { text } = result;
        setFinalText(text);
        if (text) onFinishRef.current?.(text);
      } catch (e) {
        setError(e.message);
        onErrorRef.current?.(e.message);
      } finally {
        setTranscribing(false);
      }
    };

    recorder.start(1000);
    setListening(true);
  }, [silenceMs, silenceThreshold, levelRef]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  return {
    start, stop, listening, transcribing,
    finalText, interim: "", error, supported: true,
  };
}