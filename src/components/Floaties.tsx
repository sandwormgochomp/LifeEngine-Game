import React, { useEffect, useRef } from 'react';

// Ambient "microscope dust": faint motes drifting over the world that shy
// away from the cursor. Pure decoration on its own click-transparent layer.
const NUM_MOTES = 36;

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
}

const Floaties: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const mouse = { x: -1000, y: -1000 };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const motes: Mote[] = Array.from({ length: NUM_MOTES }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 0.8 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      phase: Math.random() * Math.PI * 2,
    }));

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = performance.now() / 1000;
      for (const m of motes) {
        // slow drift with a gentle wobble
        m.x += m.vx + Math.sin(t * 0.6 + m.phase) * 0.08;
        m.y += m.vy + Math.cos(t * 0.5 + m.phase) * 0.08;

        // bump away from the cursor
        const dx = m.x - mouse.x;
        const dy = m.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 70 && dist > 0.01) {
          const push = (70 - dist) / 70 * 0.9;
          m.x += (dx / dist) * push;
          m.y += (dy / dist) * push;
        }

        // wrap around the screen
        if (m.x < -10) m.x = canvas.width + 10;
        if (m.x > canvas.width + 10) m.x = -10;
        if (m.y < -10) m.y = canvas.height + 10;
        if (m.y > canvas.height + 10) m.y = -10;

        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(190, 255, 240, ${0.04 + m.r * 0.03})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        pointerEvents: 'none',
      }}
    />
  );
};

export default Floaties;
