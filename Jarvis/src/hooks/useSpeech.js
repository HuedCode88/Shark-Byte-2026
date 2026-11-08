import { useState, useRef, useCallback, useEffect } from "react";

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const levelRef = useRef(0); // 0..1 real volume, for the wave

  const audioRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const abortRef = useRef(new AbortController());
  const pendingRef = useRef(0);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  const stop = useCallback(() => {
    abortRef.current.abort();              // cancel in-flight TTS requests
    abortRef.current = new AbortController();
    audioRef.current?.pause();
    audioRef.current = null;
    pendingRef.current = 0;
    queueRef.current = Promise.resolve();
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const playBlob = (blob) =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      // Real-volume analysis for the visualizer
      ctxRef.current ??= new AudioContext();
      const ctx = ctxRef.current;
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        levelRef.current = data.reduce((a, b) => a + b, 0) / data.length / 255;
        rafRef.current = requestAnimationFrame(tick);
      };

      const done = () => {
        cancelAnimationFrame(rafRef.current);
        levelRef.current = 0;
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.onpause = done; // fires on stop()

      ctx.resume().then(() => audio.play().then(tick).catch(done));
    });

  const speak = useCallback((text) => {
    if (!text?.trim()) return;
    const { signal } = abortRef.current;
    pendingRef.current += 1;
    setSpeaking(true);

    // Fetch immediately (so the next sentence is ready), but play in order
    const audioPromise = fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    })
      .then(async (r) => {
        if (r.ok) return r.blob()
        const result = await r.json().catch(() => ({}))
        throw new Error(
          typeof result.error === 'string' ? result.error : `TTS failed (${r.status})`,
        )
      })
      .catch(() => null);

    const playback = queueRef.current.then(async () => {
      const blob = await audioPromise;
      if (blob && !signal.aborted) await playBlob(blob);
      pendingRef.current = Math.max(0, pendingRef.current - 1);
      if (pendingRef.current === 0) setSpeaking(false);
    });
    queueRef.current = playback
    return playback
  }, []);

  return { speak, stop, speaking, levelRef, supported: true, voices: [] };
}