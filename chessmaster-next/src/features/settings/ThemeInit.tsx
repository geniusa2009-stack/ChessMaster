"use client";
import { useEffect } from "react";
import { applyTheme, getTheme } from "@/features/settings/lib/clientPrefs";

// Applies the persisted theme on mount. Theme is presentation-only (localStorage), so a brief
// default-paint before hydration is acceptable and cannot affect any authoritative state.
export function ThemeInit() {
  useEffect(() => { applyTheme(getTheme()); }, []);
  return null;
}
