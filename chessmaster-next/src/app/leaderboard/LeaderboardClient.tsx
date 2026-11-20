"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchLeaderboard, type LbResponse } from "@/features/leaderboard/services/api";
import type { SortKey } from "@/features/leaderboard/lib/ranking";
import { useT } from "@/i18n/I18nProvider";

export function LeaderboardClient() {
  const t = useT();
  const SORTS: { key: SortKey; label: string }[] = [
    { key: "rating", label: t("lb.sortRating") },
    { key: "xp", label: t("lb.sortXp") },
    { key: "wins", label: t("lb.sortWins") },
  ];
  const [sort, setSort] = useState<SortKey>("rating");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LbResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchLeaderboard(sort, page);
    if ("error" in r) { setError(r.error); setData(null); }
    else { setData(r); setError(null); }
    setLoading(false);
  }, [sort, page]);
  useEffect(() => { void load(); }, [load]);

  const metric = (e: { rating: number; xp: number; wins: number }) =>
    sort === "rating" ? e.rating : sort === "xp" ? e.xp : e.wins;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, color: "var(--green-glow)" }}>{t("lb.title")}</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {SORTS.map((s) => (
            <button key={s.key} className="cm-btn"
              style={{ background: sort === s.key ? "var(--green)" : "#2a2825", color: sort === s.key ? "#10240a" : "var(--off-white)", padding: "6px 14px" }}
              onClick={() => { setSort(s.key); setPage(1); }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: "#e57373" }}>{error}</p>}
      {data && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {t("lb.yourRank", { sort, rank: data.myRank, total: data.total })}
        </div>
      )}

      <div className="cm-panel table-scroll" style={{ padding: 8 }}>
        {loading && !data ? (
          <div style={{ padding: 24, color: "var(--muted)" }}>{t("common.loading")}</div>
        ) : data && data.entries.length === 0 ? (
          <div style={{ padding: 24, color: "var(--muted)" }}>{t("lb.empty")}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "8px 10px", width: 48 }}>#</th>
                <th style={{ padding: "8px 10px" }}>{t("lb.player")}</th>
                <th style={{ padding: "8px 10px", width: 60 }}>{t("lb.tier")}</th>
                <th style={{ padding: "8px 10px", width: 90, textAlign: "right" }}>{SORTS.find((s) => s.key === sort)!.label}</th>
                <th style={{ padding: "8px 10px", width: 70, textAlign: "right" }}>{t("lb.wl")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.map((e) => (
                <tr key={e.rank} style={{
                  borderTop: "1px solid var(--line)",
                  background: e.isMe ? "rgba(129,182,76,.16)" : "transparent",
                }}>
                  <td style={{ padding: "8px 10px", fontWeight: 800, color: e.rank <= 3 ? "var(--gold)" : "inherit" }}>{e.rank}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {e.username} {e.isMe && <span style={{ color: "var(--green-glow)", fontSize: 12 }}>({t("common.you")})</span>}
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{t("rpg.level", { level: e.level })}</div>
                  </td>
                  <td style={{ padding: "8px 10px", fontSize: 18 }} title={e.tier.key}>{e.tier.icon}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{metric(e)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--muted)" }}>{e.wins}/{e.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 12, alignItems: "center" }}>
          <button className="cm-btn" disabled={page <= 1} style={{ opacity: page <= 1 ? 0.5 : 1 }} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("lb.prev")}</button>
          <span style={{ color: "var(--muted)" }}>{t("lb.page", { page: data.page, total: data.totalPages })}</span>
          <button className="cm-btn" disabled={page >= data.totalPages} style={{ opacity: page >= data.totalPages ? 0.5 : 1 }} onClick={() => setPage((p) => p + 1)}>{t("lb.next")}</button>
        </div>
      )}
    </main>
  );
}
