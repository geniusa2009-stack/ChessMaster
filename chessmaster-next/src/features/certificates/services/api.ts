"use client";
import type { AuthoritativeCert } from "@/features/certificates/lib/view";

export async function fetchMyCertificates(): Promise<AuthoritativeCert[] | { error: string }> {
  try {
    const res = await fetch("/api/certificates");
    if (res.status === 401) return { error: "Please sign in." };
    if (!res.ok) return { error: "Failed to load certificates." };
    const data = await res.json();
    return data.certificates as AuthoritativeCert[];
  } catch { return { error: "Network error." }; }
}
