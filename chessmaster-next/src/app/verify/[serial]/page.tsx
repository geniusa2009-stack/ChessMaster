import { verifyCertificate } from "@/lib/certificates/verify";
import { getServerT, getLocale } from "@/i18n/server";
import { formatDate } from "@/i18n/format";

// Real verification: the page asks the DB. The client cannot declare a cert valid.
export default async function VerifyPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const cert = await verifyCertificate(serial);
  const { t } = await getServerT();
  const locale = await getLocale();

  return (
    <main style={{ maxWidth: 560, margin: "60px auto", padding: 20 }}>
      <h1 style={{ color: "var(--green-glow)", fontWeight: 900 }}>{t("verify.title")}</h1>
      {!cert ? (
        <div className="cm-panel" style={{ padding: 24, borderColor: "#e5737355" }}>
          <p style={{ color: "#e57373", fontWeight: 800 }}>{t("verify.notFound")}</p>
          <p style={{ color: "var(--muted)" }}>{t("verify.notFoundBody")}</p>
        </div>
      ) : cert.status === "revoked" ? (
        <div className="cm-panel" style={{ padding: 24, borderColor: "#e5737355" }}>
          <p style={{ color: "#e57373", fontWeight: 800 }}>{t("verify.revoked")}</p>
          <p>{cert.title} — {cert.recipientName}</p>
        </div>
      ) : (
        <div className="cm-panel" style={{ padding: 24, borderColor: "var(--green)" }}>
          <p style={{ color: "var(--green-glow)", fontWeight: 800 }}>{t("verify.authentic")}</p>
          <p><b>{cert.title}</b> ({cert.tier})</p>
          <p>{t("verify.awardedTo", { name: cert.recipientName })}</p>
          <p style={{ color: "var(--muted)" }}>{t("verify.issued", { date: formatDate(cert.issuedAt, locale) })}</p>
          <p style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 13 }}>ID: {cert.serial}</p>
        </div>
      )}
    </main>
  );
}
