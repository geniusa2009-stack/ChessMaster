"use client";
import { useT } from "@/i18n/I18nProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMyCertificates } from "@/features/certificates/services/api";
import { renderCertificate } from "@/features/certificates/lib/renderCanvas";
import { TIER_ORDER, TIER_THEME, type CertTier } from "@/features/certificates/lib/tiers";
import type { AuthoritativeCert } from "@/features/certificates/lib/view";

export function CertificatesClient() {
  const t = useT();
  const [certs, setCerts] = useState<AuthoritativeCert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<AuthoritativeCert | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    const r = await fetchMyCertificates();
    if ("error" in r) { setError(r.error); return; }
    setCerts(r);
    if (r.length && !active) setActive(r[0]);
  }, [active]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (active && canvasRef.current) void renderCertificate(canvasRef.current, active);
  }, [active]);

  const download = () => {
    if (!canvasRef.current || !active) return;
    const a = document.createElement("a");
    a.download = `ChessMaster-${active.tier}-${active.serial}.png`;
    a.href = canvasRef.current.toDataURL("image/png");
    document.body.appendChild(a); a.click(); a.remove();
  };
  const print = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const w = window.open("");
    if (w) { w.document.write(`<img src="${url}" style="width:100%" onload="window.print()"/>`); w.document.close(); }
  };

  if (error) return <main style={{ padding: 40, color: "#e57373" }}>{error}</main>;
  if (!certs) return <main style={{ padding: 40 }}>{t("cert.loading")}</main>;

  const ownedByTier = new Map(certs.map((c) => [c.tier as CertTier, c]));

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 20, display: "grid", gap: 20 }}>
      <h1 style={{ margin: 0, color: "var(--green-glow)" }}>{t("cert.title")}</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {TIER_ORDER.map((tier) => {
          const owned = ownedByTier.get(tier);
          const th = TIER_THEME[tier];
          return (
            <button key={tier} onClick={() => owned && setActive(owned)}
              className="cm-panel"
              style={{ padding: 16, minWidth: 210, textAlign: "left", cursor: owned ? "pointer" : "default",
                borderColor: owned ? th.color + "88" : "var(--line)",
                boxShadow: owned && active?.tier === tier ? `0 0 18px ${th.glow}` : "none",
                opacity: owned ? 1 : 0.55 }}>
              <div style={{ fontSize: 30, color: owned ? th.color : "#6b6b6b", textShadow: owned ? `0 0 14px ${th.glow}` : "none" }}>{th.icon}</div>
              <div style={{ fontWeight: 900, marginTop: 6 }}>{th.title}</div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: owned ? th.color : "#6b6b6b" }}>{th.rarity} · {th.tierLabel}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                {owned ? `Issued ${new Date(owned.issuedAt).toLocaleDateString("en-GB")}${owned.status === "revoked" ? " · REVOKED" : ""}` : th.requirement}
              </div>
            </button>
          );
        })}
      </div>

      {certs.length === 0 && (
        <div className="cm-panel" style={{ padding: 24, color: "var(--muted)" }}>
          No certificates yet. Earn them by solving 25 puzzles in a row, mastering 5 openings, or beating Titan in a ranked match.
        </div>
      )}

      {active && (
        <section className="cm-panel" style={{ padding: 16, display: "grid", gap: 12, justifyItems: "center" }}>
          <canvas ref={canvasRef} role="img" aria-label={active ? `${active.title} certificate — ${active.status}` : "certificate"} style={{ width: "100%", maxWidth: 760, height: "auto", borderRadius: 8 }} />
          <div style={{ display: "flex", gap: 12 }}>
            <button className="cm-btn" onClick={download}>{t("cert.download")}</button>
            <button className="cm-btn" style={{ background: "#3a4b63", color: "#fff" }} onClick={print}>{t("cert.print")}</button>
            <a className="cm-btn" style={{ background: "#3a4b63", color: "#fff", textDecoration: "none" }} href={`/verify/${active.serial}`} target="_blank" rel="noopener">{t("cert.verify")}</a>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>ID: {active.serial}</div>
        </section>
      )}
    </main>
  );
}
