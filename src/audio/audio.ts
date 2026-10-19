// Synthesized sounds (no audio files): soft UI blips, a coin chime, and a gentle lo-fi loop
// for the record player. Audio starts only after a tap, as phones require.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setSfx(on: boolean) { enabled = on; }

function tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export type Sfx = 'tap' | 'open' | 'close' | 'coin' | 'heart' | 'place' | 'error' | 'win' | 'pop' | 'step' | 'page' | 'bell';

export function sfx(kind: Sfx) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime;
  switch (kind) {
    case 'tap': tone(660, t, 0.05, 'square', 0.05); break;
    case 'open': tone(520, t, 0.06, 'square', 0.05); tone(780, t + 0.05, 0.07, 'square', 0.05); break;
    case 'close': tone(700, t, 0.05, 'square', 0.04); tone(470, t + 0.04, 0.07, 'square', 0.04); break;
    case 'coin': tone(988, t, 0.07, 'square', 0.06); tone(1319, t + 0.07, 0.22, 'square', 0.06); break;
    case 'heart': tone(784, t, 0.1, 'triangle', 0.12); tone(1047, t + 0.09, 0.18, 'triangle', 0.12); break;
    case 'place': tone(220, t, 0.08, 'triangle', 0.15, 0.6); tone(330, t + 0.02, 0.06, 'square', 0.03); break;
    case 'error': tone(196, t, 0.12, 'square', 0.05); tone(164, t + 0.1, 0.16, 'square', 0.05); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.2, 'square', 0.05)); break;
    case 'pop': tone(420, t, 0.06, 'sine', 0.15, 1.8); break;
    case 'step': tone(140, t, 0.03, 'triangle', 0.04); break;
    case 'page': tone(1800, t, 0.03, 'sawtooth', 0.01, 0.4); break;
    case 'bell': tone(1568, t, 0.6, 'sine', 0.08); tone(2349, t, 0.4, 'sine', 0.03); break;
  }
}

// ---------- record player: a slow, soft, generative lo-fi loop ----------

let music: { stop: () => void } | null = null;
let musicVol = 0.5;

export function setMusicVolume(v: number) {
  musicVol = v;
  if (bus && ctx) bus.gain.setTargetAtTime(0.18 * v, ctx.currentTime, 0.3);
}

let bus: GainNode | null = null;

export function musicPlaying() { return !!music; }

export function startMusic(track = 0) {
  unlockAudio();
  if (!ctx || !master || music) return;
  const c = ctx;
  bus = c.createGain();
  bus.gain.value = 0.18 * musicVol;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1800;
  bus.connect(lp).connect(master);
  // Vinyl crackle.
  const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.0015 ? (Math.random() - 0.5) * 0.9 : (Math.random() - 0.5) * 0.015;
  const crackle = c.createBufferSource();
  crackle.buffer = noise; crackle.loop = true;
  const cg = c.createGain(); cg.gain.value = 0.35;
  crackle.connect(cg).connect(bus);
  crackle.start();

  const progressions = [
    [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]],
    [[50, 53, 57, 60], [55, 58, 62, 65], [48, 52, 55, 59], [53, 57, 60, 64]],
  ];
  const prog = progressions[track % progressions.length];
  const bpm = 72, beat = 60 / bpm;
  const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
  let bar = 0;
  let next = c.currentTime + 0.1;
  const scale = [0, 2, 4, 7, 9];
  const voice = (f: number, at: number, dur: number, vol: number, type: OscillatorType) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 12;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(bus!);
    o.start(at); o.stop(at + dur + 0.05);
  };
  const schedule = () => {
    while (next < c.currentTime + 1.5) {
      const chord = prog[bar % prog.length];
      for (const n of chord) voice(midi(n), next, beat * 4.2, 0.12, 'triangle');
      voice(midi(chord[0] - 12), next, beat * 2, 0.25, 'sine');
      voice(midi(chord[0] - 12), next + beat * 2.5, beat * 1.5, 0.2, 'sine');
      // A lazy melody: a few notes per bar from the pentatonic scale above the chord root.
      for (let i = 0; i < 4; i++) {
        if (Math.random() < 0.45) continue;
        const n = chord[0] + 12 + scale[Math.floor(Math.random() * scale.length)];
        voice(midi(n), next + i * beat + (Math.random() < 0.3 ? beat / 2 : 0), beat * 1.2, 0.07, 'sine');
      }
      // Soft brushed hats.
      for (let i = 0; i < 8; i++) {
        const src = c.createBufferSource(); src.buffer = noise;
        const hg = c.createGain(); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
        const at = next + i * beat / 2 + (i % 2 ? 0.03 : 0);
        hg.gain.setValueAtTime(i % 2 ? 0.25 : 0.4, at); hg.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
        src.connect(hp).connect(hg).connect(bus!);
        src.start(at, Math.random()); src.stop(at + 0.06);
      }
      next += beat * 4;
      bar++;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 500);
  music = {
    stop: () => {
      clearInterval(timer);
      const g = bus!;
      g.gain.setTargetAtTime(0, c.currentTime, 0.4);
      setTimeout(() => { crackle.stop(); g.disconnect(); }, 1500);
      music = null; bus = null;
    },
  };
}

export function stopMusic() { music?.stop(); }
