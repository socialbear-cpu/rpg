/** Draw at the canvas's display resolution; never enlarge a low-resolution GIF. */
export function mountBifrostScene(canvas: HTMLCanvasElement, compact = false) {
  const context = canvas.getContext('2d');
  if (!context) return { setLeaving: (_value: boolean) => {}, stop: () => {} };
  const ctx = context;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 1, height = 1, dpr = 1, frame = 0, travel = 0, previous = 0;
  let leaving = false, departure = 0, stopped = false, inView = true, seed = 74123;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stars = Array.from({ length: compact ? 24 : 190 }, () => ({
    angle: random() * Math.PI * 2, phase: random(), distance: .35 + random() * .75, size: .4 + random() * .75,
  }));

  function paint(now: number) {
    frame = 0;
    if (stopped) return;
    const elapsed = previous ? Math.min((now - previous) / 1000, .05) : 0;
    previous = now;
    const dive = leaving && !motion.matches ? Math.min(1, (now - departure) / 760) : 0;
    if (!motion.matches) travel += elapsed * (.55 + dive * 2.4);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#090b16'; ctx.fillRect(0, 0, width, height);
    const x = width * .5, y = height * .39, unit = Math.max(width, height);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, unit * (.47 + dive * .3));
    glow.addColorStop(0, '#695b8d'); glow.addColorStop(.16, '#272039'); glow.addColorStop(1, '#090b16');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (const star of stars) {
      const q = (star.phase + travel) % 1, r = (.018 + q * q * star.distance) * unit;
      const tail = Math.max(0, r - (2 + q * q * unit * .065 * (1 + dive * 2)));
      const ax = Math.cos(star.angle), ay = Math.sin(star.angle) * .76;
      const alpha = Math.min(1, q * 7, (1 - q) * 8) * .85;
      const a = x + ax * tail, b = y + ay * tail, c = x + ax * r, d = y + ay * r;
      const streak = ctx.createLinearGradient(a, b, c + .01, d + .01);
      streak.addColorStop(0, 'rgba(206,192,240,0)'); streak.addColorStop(1, `rgba(230,222,250,${alpha})`);
      ctx.strokeStyle = streak; ctx.lineWidth = star.size * (.6 + q) * Math.max(1, width / 1100);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    }
    const half = width * .68, bottom = height * 1.16;
    ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.lineTo(x + half, bottom); ctx.lineTo(x - half, bottom); ctx.closePath();
    const deck = ctx.createLinearGradient(0, y, 0, height);
    deck.addColorStop(0, 'rgba(211,190,255,.4)'); deck.addColorStop(1, 'rgba(155,126,221,.08)');
    ctx.fillStyle = deck; ctx.fill();
    for (let i = 0; i <= 8; i++) {
      const edge = i === 0 || i === 8, bx = x - half + i * half / 4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (bx - x) * .18, y + (height - y) * .35, bx, bottom);
      ctx.strokeStyle = edge ? '#e3d5ff' : 'rgba(199,176,249,.65)'; ctx.lineWidth = edge ? 1.8 : 1;
      ctx.shadowColor = '#bda1f2'; ctx.shadowBlur = compact ? 0 : edge ? 14 : 5;
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    for (let i = 0; i < (compact ? 6 : 18); i++) {
      const q = (i / (compact ? 6 : 18) + travel) % 1, z = q * q;
      const py = y + z * (bottom - y), hw = 3 + half * z;
      ctx.strokeStyle = `rgba(219,203,255,${Math.min(1, q * 8, (1 - q) * 7) * .42})`; ctx.lineWidth = .5 + z * 1.1;
      ctx.beginPath(); ctx.moveTo(x - hw, py); ctx.quadraticCurveTo(x, py + z * height * .025, x + hw, py); ctx.stroke();
    }
    const core = ctx.createRadialGradient(x, y, 0, x, y, Math.max(compact ? 4 : 40, width * .1) * (1 + dive * 5));
    core.addColorStop(0, 'rgba(248,242,255,.95)'); core.addColorStop(.08, 'rgba(223,203,255,.65)');
    core.addColorStop(.4, 'rgba(183,151,240,.15)'); core.addColorStop(1, 'rgba(183,151,240,0)');
    ctx.fillStyle = core; ctx.fillRect(0, 0, width, height);
    if (!motion.matches && inView && !document.hidden) frame = requestAnimationFrame(paint);
  }

  function refresh() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    if (!stopped) paint(performance.now());
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2, 4096 / width, 4096 / height);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    refresh();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting; refresh();
  });
  intersection?.observe(canvas);
  motion.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('resize', resize);
  resize();
  return {
    setLeaving(value: boolean) { leaving = value; departure = performance.now(); },
    stop() {
      stopped = true; cancelAnimationFrame(frame);
      observer.disconnect(); intersection?.disconnect();
      motion.removeEventListener('change', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('resize', resize);
    },
  };
}
