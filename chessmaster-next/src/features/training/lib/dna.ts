// Chess DNA — descriptive, evidence-based, NOT psychological. Each measured domain gets a band
// relative to the player's OWN measured domains; domains without enough evidence say so.
import type { DomainSkill } from "@/features/training/lib/skill";

export type DnaBand = "insufficient_evidence" | "developing" | "steady" | "strong";
export interface DnaEntry { domain: string; band: DnaBand; score: number | null; note: string }

export function chessDNA(skills: DomainSkill[]): DnaEntry[] {
  const measured = skills.filter((s) => s.sufficient);
  const avg = measured.length ? measured.reduce((a, s) => a + s.score, 0) / measured.length : 0;
  return skills.map((s) => {
    if (!s.sufficient) return { domain: s.domain, band: "insufficient_evidence", score: null, note: "Insufficient evidence." };
    let band: DnaBand = "steady";
    if (s.score >= avg + 8) band = "strong";
    else if (s.score <= avg - 8) band = "developing";
    const note = band === "strong" ? "Strong relative to your other measured areas."
      : band === "developing" ? "Developing relative to your other measured areas."
      : "On par with your other measured areas.";
    return { domain: s.domain, band, score: s.score, note };
  });
}
