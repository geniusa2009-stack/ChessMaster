"use client";
// WebAudio SFX ported from the old beep()/sfx* helpers. No assets, no CDN.
// Respects the user's sound preference (Phase L settings), default on.
import { isSoundEnabled } from "@/features/settings/lib/clientPrefs";
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}
function beep(freq: number, dur: number, type: OscillatorType, gain: number) {
  if (!isSoundEnabled()) return; // respect the user's sound preference
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g); g.connect(c.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.stop(c.currentTime + dur);
}
export const sfxMove = () => beep(330, 0.08, "triangle", 0.05);
export const sfxCapture = () => { beep(150, 0.13, "sawtooth", 0.08); setTimeout(() => beep(90, 0.1, "square", 0.06), 18); };
export const sfxCheck = () => beep(640, 0.12, "square", 0.06);
export const sfxAlarm = () => { beep(900, 0.1, "square", 0.08); setTimeout(() => beep(900, 0.1, "square", 0.08), 160); };
export const sfxWin = () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16, "triangle", 0.07), i * 120));
