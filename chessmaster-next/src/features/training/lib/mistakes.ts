// Mistake memory: aggregate recurring weaknesses from real events. A single failure is NOT a
// weakness (avoids noise); a weakness needs enough attempts AND a high fail rate.
export interface ThemeStat { theme: string; attempts: number; fails: number; failRate: number; sufficient: boolean }

export const WEAKNESS_MIN_ATTEMPTS = 4;
export const WEAKNESS_FAIL_RATE = 0.4;

export function aggregateByTheme(events: Array<{ theme: string; outcome: "success" | "fail" }>): ThemeStat[] {
  const m = new Map<string, { attempts: number; fails: number }>();
  for (const e of events) {
    const s = m.get(e.theme) ?? { attempts: 0, fails: 0 };
    s.attempts++; if (e.outcome === "fail") s.fails++;
    m.set(e.theme, s);
  }
  return [...m.entries()].map(([theme, s]) => ({
    theme, attempts: s.attempts, fails: s.fails,
    failRate: s.attempts ? +(s.fails / s.attempts).toFixed(2) : 0,
    sufficient: s.attempts >= WEAKNESS_MIN_ATTEMPTS,
  })).sort((a, b) => (b.failRate - a.failRate) || (b.attempts - a.attempts) || a.theme.localeCompare(b.theme));
}

// Weaknesses = sufficient evidence AND fail rate over threshold. Deterministic ordering.
export function detectWeaknesses(stats: ThemeStat[]): ThemeStat[] {
  return stats.filter((s) => s.sufficient && s.failRate >= WEAKNESS_FAIL_RATE);
}
