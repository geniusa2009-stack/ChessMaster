"use client";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";

interface AdminUser { id: string; username: string; email: string | null; role: string; xp: number; rating: number; wins: number; losses: number; created_at: string }
interface UsersResp { users: AdminUser[]; page: number; pageSize: number; total: number; totalPages: number }

export function AdminClient() {
  const t = useT();
  const [data, setData] = useState<UsersResp | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [serial, setSerial] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) qs.set("search", search);
    const res = await fetch(`/api/admin/users?${qs.toString()}`);
    if (res.ok) setData(await res.json());
  }, [page, search]);
  useEffect(() => { void load(); }, [load]);

  const revoke = async () => {
    setMsg(null);
    const res = await fetch("/api/admin/certificates/revoke", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial: serial.trim(), revoke: true }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setMsg(t("admin.revokeOk"));
    else setMsg(d.error === "CERT_NOT_FOUND" ? t("admin.revokeNotFound") : d.error || "Error");
  };

  return (
    <main style={{ maxWidth: 1000, margin: "30px auto", padding: 20, display: "grid", gap: 20 }}>
      <h1 style={{ margin: 0, color: "var(--green-glow)" }}>{t("admin.title")}</h1>

      <section className="cm-panel" style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("admin.users")}</h2>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{t("admin.totalUsers")}: {data?.total ?? "…"}</span>
          <input className="cm-input" style={{ width: "auto", marginInlineStart: "auto" }} placeholder={t("admin.search")}
            value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
            <thead><tr style={{ textAlign: "start", color: "var(--muted)" }}>
              <th style={{ padding: 8 }}>{t("admin.col.user")}</th><th style={{ padding: 8 }}>{t("admin.col.email")}</th>
              <th style={{ padding: 8 }}>{t("admin.col.role")}</th><th style={{ padding: 8 }}>{t("admin.col.rating")}</th>
              <th style={{ padding: 8 }}>{t("admin.col.xp")}</th><th style={{ padding: 8 }}>{t("admin.col.joined")}</th>
            </tr></thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: 8, fontWeight: 700 }}>{u.username}</td>
                  <td style={{ padding: 8, color: "var(--muted)" }}>{u.email}</td>
                  <td style={{ padding: 8 }}>{u.role}</td>
                  <td style={{ padding: 8 }}>{u.rating}</td>
                  <td style={{ padding: 8 }}>{u.xp}</td>
                  <td style={{ padding: 8, color: "var(--muted)" }}>{new Date(u.created_at).toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.totalPages > 1 && (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
            <button className="cm-btn" aria-label={t("lb.prev")} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>←</button>
            <span style={{ color: "var(--muted)" }}>{data.page} / {data.totalPages}</span>
            <button className="cm-btn" aria-label={t("lb.next")} disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
          </div>
        )}
      </section>

      <section className="cm-panel" style={{ padding: 16, display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{t("admin.revokeTitle")}</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="cm-input" style={{ width: "auto", flex: 1, fontFamily: "monospace" }}
            placeholder={t("admin.revokeSerial")} value={serial} onChange={(e) => setSerial(e.target.value)} />
          <button className="cm-btn" style={{ background: "#b3413a", color: "#fff" }} disabled={!serial.trim()} onClick={revoke}>{t("admin.revoke")}</button>
        </div>
        {msg && <div role="status" aria-live="polite" style={{ fontSize: 14, color: "var(--muted)" }}>{msg}</div>}
      </section>
    </main>
  );
}
