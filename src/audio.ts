/** Procedural SFX + ambient. Unlock on first gesture. */
let ctx: AudioContext | null = null;
let unlocked = false;
let muted = false;
let ambientNodes: { stop: () => void } | null = null;
let ambientKind: "title" | "combat" | null = null;
function getCtx(): AudioContext { if (!ctx) ctx = new AudioContext(); return ctx; }
export function isMuted(): boolean { return muted; }
function saveMute() { try { localStorage.setItem("ashbound-mute", muted ? "1" : "0"); } catch {} }
export function loadMutePreference() { try { muted = localStorage.getItem("ashbound-mute") === "1"; } catch { muted = false; } }
export function setMuted(v: boolean) { muted = v; if (muted) stopAmbient(); else if (ambientKind) startAmbient(ambientKind); saveMute(); }
export function toggleMute(): boolean { setMuted(!muted); return muted; }
export async function unlockAudio(): Promise<void> { const c = getCtx(); if (c.state === "suspended") await c.resume(); unlocked = true; if (!muted && ambientKind) startAmbient(ambientKind); }
function now(): number { return getCtx().currentTime; }
function envGain(t0: number, attack: number, decay: number, peak = 0.2): GainNode { const c = getCtx(); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay); return g; }
function tone(freq: number, duration: number, type: OscillatorType = "sine", peak = 0.15, attack = 0.01): void { if (muted || !unlocked) return; const c = getCtx(); const t0 = now(); const osc = c.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t0); const g = envGain(t0, attack, duration, peak); osc.connect(g); g.connect(c.destination); osc.start(t0); osc.stop(t0 + attack + duration + 0.02); }
function noiseBurst(duration: number, peak = 0.12, bandHz = 800): void { if (muted || !unlocked) return; const c = getCtx(); const t0 = now(); const len = Math.floor(c.sampleRate * duration); const buf = c.createBuffer(1, len, c.sampleRate); const data = buf.getChannelData(0); for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1; const src = c.createBufferSource(); src.buffer = buf; const filter = c.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = bandHz; filter.Q.value = 0.8; const g = envGain(t0, 0.005, duration * 0.9, peak); src.connect(filter); filter.connect(g); g.connect(c.destination); src.start(t0); src.stop(t0 + duration + 0.02); }
export function sfxClick() { tone(660, 0.06, "triangle", 0.08, 0.005); tone(990, 0.04, "sine", 0.04, 0.005); }
export function sfxCardPlay() { tone(220, 0.08, "sawtooth", 0.1, 0.01); tone(330, 0.12, "triangle", 0.08, 0.02); noiseBurst(0.08, 0.06, 1200); }
export function sfxAttack() { noiseBurst(0.12, 0.18, 400); tone(120, 0.15, "square", 0.12, 0.005); tone(90, 0.2, "sawtooth", 0.08, 0.01); }
export function sfxBlock() { tone(440, 0.1, "triangle", 0.1, 0.005); tone(550, 0.14, "sine", 0.07, 0.02); noiseBurst(0.06, 0.05, 2000); }
export function sfxDraw() { tone(520, 0.05, "sine", 0.05, 0.008); setTimeout(() => tone(640, 0.05, "sine", 0.04, 0.008), 40); }
export function sfxMap() { tone(300, 0.08, "triangle", 0.07, 0.01); tone(450, 0.1, "sine", 0.05, 0.02); }
export function sfxReward() { tone(523, 0.1, "sine", 0.1, 0.01); setTimeout(() => tone(659, 0.1, "sine", 0.1, 0.01), 80); setTimeout(() => tone(784, 0.18, "triangle", 0.12, 0.01), 160); }
export function sfxVictory() { [392,494,587,784].forEach((f,i)=>setTimeout(()=>tone(f,0.25,"triangle",0.12,0.02), i*120)); }
export function sfxDefeat() { tone(200,0.35,"sawtooth",0.12,0.02); setTimeout(()=>tone(140,0.5,"sawtooth",0.1,0.03),150); setTimeout(()=>tone(90,0.7,"triangle",0.08,0.04),320); }
export function sfxHitBig() { noiseBurst(0.2,0.22,280); tone(70,0.3,"square",0.15,0.005); }
export function sfxHeal() { tone(400,0.12,"sine",0.08,0.02); setTimeout(()=>tone(600,0.15,"sine",0.08,0.02),70); }
function stopAmbient() { if (ambientNodes) { ambientNodes.stop(); ambientNodes = null; } }
export function startAmbient(kind: "title" | "combat") {
  ambientKind = kind; stopAmbient(); if (muted || !unlocked) return;
  const c = getCtx(); const master = c.createGain(); master.gain.value = kind === "title" ? 0.035 : 0.028; master.connect(c.destination);
  const osc1 = c.createOscillator(); osc1.type = "sine"; osc1.frequency.value = kind === "title" ? 55 : 48;
  const osc2 = c.createOscillator(); osc2.type = "triangle"; osc2.frequency.value = kind === "title" ? 82.5 : 72;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lfoGain = c.createGain(); lfoGain.gain.value = 0.01; lfo.connect(lfoGain); lfoGain.connect(master.gain);
  const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = kind === "title" ? 280 : 220;
  osc1.connect(filter); osc2.connect(filter); filter.connect(master);
  const t0 = now(); osc1.start(t0); osc2.start(t0); lfo.start(t0);
  const crackleLen = c.sampleRate * 4; const crackleBuf = c.createBuffer(1, crackleLen, c.sampleRate); const cd = crackleBuf.getChannelData(0);
  for (let i = 0; i < crackleLen; i++) cd[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 0.4 : 0.02);
  const crackle = c.createBufferSource(); crackle.buffer = crackleBuf; crackle.loop = true;
  const cFilter = c.createBiquadFilter(); cFilter.type = "highpass"; cFilter.frequency.value = 2000; const cGain = c.createGain(); cGain.gain.value = 0.015;
  crackle.connect(cFilter); cFilter.connect(cGain); cGain.connect(master); crackle.start(t0);
  ambientNodes = { stop: () => { try { osc1.stop(); osc2.stop(); lfo.stop(); crackle.stop(); } catch {} master.disconnect(); } };
}
export function setAmbient(kind: "title" | "combat" | "none") { if (kind === "none") { ambientKind = null; stopAmbient(); return; } if (ambientKind === kind && ambientNodes) return; startAmbient(kind); }
