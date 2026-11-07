import { useEffect, useRef } from "react";

export default function SpeechWave({
  active,
  levelRef,
  width = 320,
  height = 80,
  color = "#4fd1ff",
}) {
  const canvasRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active; // lets the animation loop read the latest value

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let amp = 0.04; // current amplitude (eased)
    let t = 0;
    let raf;

    const draw = () => {
      const now = performance.now();
      const target = activeRef.current
        ? reduceMotion ? 0.3 : 0.1 + (levelRef?.current ?? 0) * 1.2
        : 0.04;

      amp += (target - amp) * 0.12; // ease in and out
      t += activeRef.current ? 0.12 : 0.03;

      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.lineCap = "round";

      // Three layered waves for depth
      [
        { freq: 0.020, speed: 1.0, alpha: 1.0, lw: 2.5, scale: 1.0 },
        { freq: 0.030, speed: 1.4, alpha: 0.5, lw: 1.8, scale: 0.7 },
        { freq: 0.045, speed: 0.8, alpha: 0.3, lw: 1.2, scale: 0.5 },
      ].forEach(({ freq, speed, alpha, lw, scale }) => {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let x = 0; x <= width; x++) {
          // Taper the edges so the wave fades at both ends
          const envelope = Math.sin((x / width) * Math.PI);
          const y =
            height / 2 +
            Math.sin(x * freq + t * speed) * (height / 2) * amp * scale * envelope;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [width, height, color, levelRef]);

  return <canvas ref={canvasRef} style={{ width, height }} aria-hidden="true" />;
}