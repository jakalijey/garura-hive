let ctx = null, enabled = true;

function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } }
  if (ctx && ctx.state === 'suspended') ctx.resume().then(() => { document.documentElement.dataset.audio = ctx.state; }).catch(() => {});
  if (ctx) document.documentElement.dataset.audio = ctx.state;
  return ctx;
}

function tone({ f0, f1 = f0, dur = 0.12, type = 'sine', gain = 0.12, delay = 0 }) {
  const c = ac(); if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}

export const sound = {
  setEnabled(v) { enabled = !!v; },
  get enabled() { return enabled; },
  unlock() { ac(); },
  tap() { tone({ f0: 880 + Math.random() * 120, f1: 620, dur: 0.07, type: 'triangle', gain: 0.07 }); },
  land() { tone({ f0: 420, f1: 140, dur: 0.16, type: 'sine', gain: 0.16 }); tone({ f0: 1200, f1: 900, dur: 0.05, type: 'sine', gain: 0.03, delay: 0.02 }); },
  full() { tone({ f0: 180, f1: 150, dur: 0.18, type: 'square', gain: 0.04 }); },
  withdraw() { [523, 659, 784, 1047].forEach((f, i) => tone({ f0: f, f1: f * 1.01, dur: 0.22, type: 'triangle', gain: 0.08, delay: i * 0.09 })); },
};
