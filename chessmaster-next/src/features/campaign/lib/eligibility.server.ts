import "server-only";
// Server-only wrapper that feeds the verified corpus into the pure campaign resolver. Never exposes
// solutions — only puzzle/opening ids and counts.
import { eligibleBySkill } from "@/features/curriculum/lib/eligibility.server";
import { OPENINGS } from "@/features/openings/lib/data";
import { resolveCampaignPure, type ResolvedLevel } from "@/features/campaign/lib/resolve";
import type { Level, PublicationStatus } from "@/features/campaign/lib/catalog";

export type { ResolvedLevel } from "@/features/campaign/lib/resolve";

export function resolveCampaign(): Record<string, ResolvedLevel> {
  const elig = eligibleBySkill();
  return resolveCampaignPure(elig, OPENINGS.map((o) => ({ id: o.id, tier: o.tier })));
}

export function effectiveStatus(lv: Level, r: ResolvedLevel | undefined): PublicationStatus {
  if (lv.type === "concept" || lv.type === "review") return lv.status;
  return r ? r.status : lv.status;
}
