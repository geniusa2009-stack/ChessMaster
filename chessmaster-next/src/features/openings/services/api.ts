"use client";
import type { Opening } from "@/features/openings/lib/data";

export interface OpeningListItem extends Opening { completed: boolean; mastered: boolean }
export interface OpeningStats { masteredCount: number }

export async function fetchOpenings(): Promise<{ openings: OpeningListItem[]; stats: OpeningStats } | { error: string }> {
  try {
    const res = await fetch("/api/openings");
    if (res.status === 401) return { error: "Please sign in." };
    if (!res.ok) return { error: "Failed to load openings." };
    return await res.json();
  } catch { return { error: "Network error." }; }
}

export interface CompleteResponse {
  status: "ok"; xpAwarded: number; mastered: boolean; masteredCount: number; newCertificates: string[];
  error?: string;
}
export async function submitCompletion(openingId: string, moves: string[], flawless: boolean): Promise<CompleteResponse | { error: string }> {
  try {
    const res = await fetch("/api/openings/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingId, moves, flawless }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || "Rejected" };
    return data as CompleteResponse;
  } catch { return { error: "Network error." }; }
}
