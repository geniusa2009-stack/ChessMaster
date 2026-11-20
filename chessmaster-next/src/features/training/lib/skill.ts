// Deterministic training-skill model. NOT an Elo rating and NOT XP — a per-domain performance
// estimate derived only from real attempt events.
//
// Model (documented):
//  - cold start: score = 50 (neutral), confidence = 0.
//  - per attempt result r ∈ {1 success, 0 fail}, weighted by difficulty (harder success counts more,
//    harder failure penalises less): easy .55, medium .70, hard .85, expert 1.00.
//  - EWMA with alpha = 0.3 over the weighted signal → score in [0,100].
//  - confidence = min(1, attempts / MIN_EVIDENCE), MIN_EVIDENCE = 5. Below that, treat as
//    "insufficient evidence" (don't claim a weakness/strength from 1–2 attempts).
//  - trend = sign(EWMA(last 3) - EWMA(prev 3)) when ≥6 attempts, else "flat".
import type { Domain } from "@/features/training/lib/domains";

export type Difficulty = "easy" | "medium" | "hard" | "expert";
export interface AttemptEvent { domain: Domain; difficulty: Difficulty; success: boolean; weight?: number }

export const MIN_EVIDENCE = 5;
const ALPHA = 0.3;
const DIFF_W: Record<Difficulty, number> = { easy: 0.55, medium: 0.7, hard: 0.85, expert: 1.0 };

export interface DomainSkill {
  domain: Domain;
  score: number;        // 0..100
  confidence: number;   // 0..1
  attempts: number;
  correct: number;
  sufficient: boolean;  // confidence meets MIN_EVIDENCE
  trend: "up" | "down" | "flat";
}

export function computeDomainSkill(domain: Domain, events: AttemptEvent[]): DomainSkill {
  if (events.length === 0) {
    return { domain, score: 50, confidence: 0, attempts: 0, correct: 0, sufficient: false, trend: "flat" };
  }
  let ewma = 0.5; // neutral start in [0,1]
  const signals: number[] = [];
  let correct = 0;
  for (const e of events) {
    const w = e.weight ?? DIFF_W[e.difficulty];
    // success contributes w (up to 1); failure contributes (1 - w) blended toward 0 → harder fail
    // hurts less. Clamp to [0,1].
    const signal = e.success ? 0.5 + 0.5 * w : 0.5 - 0.5 * w;
    ewma = ewma + ALPHA * (signal - ewma);
    signals.push(signal);
    if (e.success) correct++;
  }
  const attempts = events.length;
  const confidence = Math.min(1, attempts / MIN_EVIDENCE);
  let trend: "up" | "down" | "flat" = "flat";
  if (attempts >= 6) {
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const last = avg(signals.slice(-3)); const prev = avg(signals.slice(-6, -3));
    trend = last > prev + 0.02 ? "up" : last < prev - 0.02 ? "down" : "flat";
  }
  return {
    domain,
    score: Math.round(Math.max(0, Math.min(100, ewma * 100))),
    confidence: +confidence.toFixed(2),
    attempts, correct,
    sufficient: attempts >= MIN_EVIDENCE,
    trend,
  };
}
