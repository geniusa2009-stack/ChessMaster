import Link from "next/link";
import { registerAction } from "../actions";
import { getServerT } from "@/i18n/server";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { t } = await getServerT();
  return (
    <main style={{ maxWidth: 400, margin: "60px auto", padding: 20 }}>
      <h1 style={{ color: "var(--green-glow)", fontWeight: 900 }}>{t("auth.register")}</h1>
      {sp.error && <p style={{ color: "#e57373" }}>{sp.error}</p>}
      <form action={registerAction} className="cm-panel" style={{ padding: 20, display: "grid", gap: 12 }}>
        <input className="cm-input" name="username" placeholder={t("auth.username")} required minLength={3} maxLength={24} />
        <input className="cm-input" type="email" name="email" placeholder={t("auth.email")} required autoComplete="email" />
        <input className="cm-input" type="password" name="password" placeholder={t("auth.passwordHint")} required minLength={8} autoComplete="new-password" />
        <button className="cm-btn" type="submit">{t("auth.register")}</button>
      </form>
      <p style={{ marginTop: 12 }}>{t("auth.haveAccount")} <Link href="/login">{t("auth.login")}</Link></p>
    </main>
  );
}
