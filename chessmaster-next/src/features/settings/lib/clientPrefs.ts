"use client";
import { THEME_KEY, SOUND_KEY, normalizeTheme, soundEnabledFrom, type Theme } from "@/features/settings/lib/prefs";

// Thin localStorage accessors + DOM application. Guarded for SSR.
export function getTheme(): Theme {
  if (typeof window === "undefined") return "default";
  try { return normalizeTheme(localStorage.getItem(THEME_KEY)); } catch { return "default"; }
}
export function setTheme(theme: Theme) {
  const t = normalizeTheme(theme);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  applyTheme(t);
}
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "default") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", normalizeTheme(theme));
}
export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try { return soundEnabledFrom(localStorage.getItem(SOUND_KEY)); } catch { return true; }
}
export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}
