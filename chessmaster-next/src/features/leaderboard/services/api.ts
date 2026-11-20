"use client";
import type { SortKey } from "@/features/leaderboard/lib/ranking";

export interface LbEntry {
  rank: number; username: string; avatarUrl: string | null;
  rating: number; xp: number; wins: number; losses: number; draws: number;
  level: number; tier: { key: string; icon: string }; isMe: boolean;
}
export interface LbResponse {
  sort: SortKey; page: number; pageSize: number; total: number; totalPages: number;
  myRank: number; entries: LbEntry[];
}

export async function fetchLeaderboard(sort: SortKey, page: number): Promise<LbResponse | { error: string }> {
  try {
    const res = await fetch(`/api/leaderboard?sort=${encodeURIComponent(sort)}&page=${page}`);
    if (res.status === 401) return { error: "Please sign in." };
    if (!res.ok) return { error: "Failed to load leaderboard." };
    return await res.json();
  } catch { return { error: "Network error." }; }
}
