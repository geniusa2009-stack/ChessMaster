// Client presentation preferences (ported from the legacy settings drawer). These are
// PRESENTATION-ONLY: persisted in localStorage, whitelisted, and never sent to the server or
// used for authorization. Pure helpers so they can be unit-tested.
export const THEMES = ["default", "light", "midnight"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "default";

export const THEME_KEY = "cm_theme";
export const SOUND_KEY = "cm_sound";

export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}
export function normalizeTheme(v: unknown): Theme {
  return isTheme(v) ? v : DEFAULT_THEME;
}

// Sound default ON (parity). Any value other than the literal "off" is treated as on.
export function soundEnabledFrom(v: unknown): boolean {
  return v !== "off";
}
