"use client";
export interface Progression {
  xp: number; level: number; xpIntoLevel: number; xpForNextLevel: number;
  tier: { key: string; icon: string }; streak: number; bestStreak: number;
  quests: { key: string; title: string; target: number; progress: number; reward: number; done: boolean; claimed: boolean }[];
  achievements: { key: string; title: string; earned: boolean }[];
  perks: { key: string; title: string; description: string; cost: number; owned: boolean }[];
}

export async function fetchProgression(): Promise<Progression | { error: string }> {
  try {
    const res = await fetch("/api/progression");
    if (res.status === 401) return { error: "Please sign in." };
    if (!res.ok) return { error: "Failed to load progression." };
    return await res.json();
  } catch { return { error: "Network error." }; }
}
export async function claimQuest(questKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/quests/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questKey }) });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok && d.accepted !== false, error: d.error };
  } catch { return { ok: false, error: "Network error." }; }
}
export async function buyPerk(perkKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/perks/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ perkKey }) });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok && d.accepted !== false, error: d.error };
  } catch { return { ok: false, error: "Network error." }; }
}
export async function syncAchievements(): Promise<void> {
  try { await fetch("/api/achievements/sync", { method: "POST" }); } catch { /* ignore */ }
}
