// Skill domains + theme→domain mapping. Honest: with the current validated content (mate puzzles
// only), the domains that can actually accrue evidence are checkmate_patterns and calculation.
// Other domains stay in an explicit cold-start / insufficient-evidence state until content exists.
export const DOMAINS = [
  "tactical_vision", "calculation", "checkmate_patterns", "defensive_play", "endgame", "opening_knowledge",
] as const;
export type Domain = (typeof DOMAINS)[number];

// A theme contributes to one or more domains (weighted). mate themes exercise both pattern
// recognition and (for longer mates) calculation.
export function themeDomains(theme: string): Array<{ domain: Domain; weight: number }> {
  if (/^mateIn1$/i.test(theme)) return [{ domain: "checkmate_patterns", weight: 1 }];
  if (/^mateIn2$/i.test(theme)) return [{ domain: "checkmate_patterns", weight: 1 }, { domain: "calculation", weight: 0.5 }];
  if (/^mateIn\d+$/i.test(theme)) return [{ domain: "checkmate_patterns", weight: 1 }, { domain: "calculation", weight: 1 }];
  if (/fork|pin|skewer|double|discovered|deflection|attraction|removing|zwischenzug/i.test(theme))
    return [{ domain: "tactical_vision", weight: 1 }];
  if (/defens/i.test(theme)) return [{ domain: "defensive_play", weight: 1 }];
  if (/endgame/i.test(theme)) return [{ domain: "endgame", weight: 1 }];
  if (/opening/i.test(theme)) return [{ domain: "opening_knowledge", weight: 1 }];
  return [{ domain: "tactical_vision", weight: 1 }];
}

function isDomain(x: string | null | undefined): x is Domain {
  return !!x && (DOMAINS as readonly string[]).includes(x);
}

// Authoritative mapping used by the aggregator. When the event carries the puzzle's verified
// primary `domain` (R4+ rows), that domain is authoritative; mate events additionally feed
// `calculation` for the longer mates (recognising that mate-in-2/3 also exercise calculation).
// Legacy rows with no stored domain fall back to the theme-only mapping above.
export function domainsForEvent(theme: string, domain?: string | null): Array<{ domain: Domain; weight: number }> {
  if (!isDomain(domain)) return themeDomains(theme);
  const out: Array<{ domain: Domain; weight: number }> = [{ domain, weight: 1 }];
  if (domain === "checkmate_patterns") {
    if (/^mateIn2$/i.test(theme)) out.push({ domain: "calculation", weight: 0.5 });
    else if (/^mateIn\d+$/i.test(theme) && !/^mateIn1$/i.test(theme)) out.push({ domain: "calculation", weight: 1 });
  }
  return out;
}
