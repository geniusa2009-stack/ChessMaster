// ============================================================
//  ChessMaster — Logo Components (Pure SVG, no external images)
// ------------------------------------------------------------
//  Design idea:
//    A minimalist, angular Knight (حصان الشطرنج) sitting inside a
//    rounded "board tile". The tile shape doubles as a modern
//    container that sits perfectly on dark UIs (#312e2b).
//    Brand colors follow world-class chess platforms:
//      - Chess green : #81b64c (light) / #769656 (deep)
//      - Off-white   : #eeeed2  |  Pure white: #ffffff
//    Background is fully TRANSPARENT.
//
//  Usage:
//    import { LogoIcon, LogoFull } from "./ChessMasterLogo";
//
//    <LogoIcon size={64} />                 // icon only
//    <LogoFull size={48} />                 // icon + "ChessMaster"
//
//  How to RESIZE later:
//    Everything scales from a single `size` prop (in pixels).
//    - LogoIcon  -> the tile width/height = size.
//    - LogoFull  -> the icon height = size, and the wordmark
//                   font-size scales relative to it automatically.
//    The viewBox is fixed, so the SVG stays crisp at ANY size.
// ============================================================

import React from "react";

// ---- Central color palette (edit here to re-theme everything) ----
const COLORS = {
  greenLight: "#81b64c",
  greenDeep: "#769656",
  offWhite: "#eeeed2",
  white: "#ffffff",
  dark: "#312e2b",
};

// ------------------------------------------------------------
//  1) ICON ONLY
//     viewBox 0 0 120 120 — square, transparent background.
// ------------------------------------------------------------
export function LogoIcon({ size = 80, title = "ChessMaster" }) {
  // unique id so multiple logos on one page don't clash
  const gid = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Green gradient for the tile */}
        <linearGradient id={`tile-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS.greenLight} />
          <stop offset="100%" stopColor={COLORS.greenDeep} />
        </linearGradient>
      </defs>

      {/* Rounded "board tile" — the brand container */}
      <rect
        x="6"
        y="6"
        width="108"
        height="108"
        rx="26"
        fill={`url(#tile-${gid})`}
      />

      {/* Subtle inner border for depth */}
      <rect
        x="6"
        y="6"
        width="108"
        height="108"
        rx="26"
        fill="none"
        stroke={COLORS.offWhite}
        strokeOpacity="0.18"
        strokeWidth="2"
      />

      {/* Decorative 2x2 checker accent (bottom-left corner) */}
      <g opacity="0.16" fill={COLORS.dark}>
        <rect x="18" y="84" width="9" height="9" />
        <rect x="27" y="93" width="9" height="9" />
      </g>

      {/* ---- The Knight (angular minimalist silhouette, off-white) ---- */}
      <g fill={COLORS.offWhite}>
        {/* Head + neck */}
        <polygon
          points="
            66,22  79,33  82,52  76,64  81,80  86,92
            40,92  43,78  35,70  26,64  21,57  29,49
            37,44  41,34  50,26
          "
        />
        {/* Base plinth */}
        <polygon points="34,92 86,92 90,104 30,104" />
        {/* Eye (negative space, tile-colored) */}
        <circle cx="46" cy="44" r="3.4" fill={COLORS.greenDeep} />
      </g>
    </svg>
  );
}

// ------------------------------------------------------------
//  2) ICON + TYPOGRAPHY  ("ChessMaster")
//     The icon keeps its square ratio; the wordmark scales with it.
// ------------------------------------------------------------
export function LogoFull({ size = 56, title = "ChessMaster" }) {
  const gap = size * 0.28;              // space between icon and text
  const fontSize = size * 0.62;         // wordmark size relative to icon

  return (
    <div
      role="img"
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: `${gap}px`,
        lineHeight: 1,
      }}
    >
      <LogoIcon size={size} title={title} />

      <span
        style={{
          fontFamily:
            "'Poppins','Segoe UI',system-ui,-apple-system,sans-serif",
          fontWeight: 800,
          fontSize: `${fontSize}px`,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: COLORS.offWhite }}>Chess</span>
        <span style={{ color: COLORS.greenLight }}>Master</span>
      </span>
    </div>
  );
}

// ------------------------------------------------------------
//  Demo preview (default export) — shows both versions on a dark bg.
//  Safe to delete in production; just keep the named exports above.
// ------------------------------------------------------------
export default function LogoShowcase() {
  return (
    <div
      style={{
        background: COLORS.dark,
        padding: 48,
        display: "flex",
        flexDirection: "column",
        gap: 40,
        alignItems: "flex-start",
        minHeight: "100vh",
      }}
    >
      <LogoIcon size={96} />
      <LogoFull size={64} />
      <LogoFull size={40} />
    </div>
  );
}
