import Link from "next/link";
import { loginAction } from "../actions";
import { getServerT } from "@/i18n/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; registered?: string }> }) {
  const sp = await searchParams;
  const { t } = await getServerT();
  return (
    <main style={{ maxWidth: 400, margin: "60px auto", padding: 20 }}>
      <h1 style={{ color: "var(--green-glow)", fontWeight: 900 }}>{t("auth.login")}</h1>
      {sp.registered && <p style={{ color: "var(--green-glow)" }}>{t("auth.registered")}</p>}
      {sp.error && <p style={{ color: "#e57373" }}>{t("auth.invalid")}</p>}
      <form action={loginAction} className="cm-panel" style={{ padding: 20, display: "grid", gap: 12 }}>
        <input className="cm-input" type="email" name="email" placeholder={t("auth.email")} required autoComplete="email" />
        <input className="cm-input" type="password" name="password" placeholder={t("auth.password")} required autoComplete="current-password" />
        <button className="cm-btn" type="submit">{t("auth.signIn")}</button>
      </form>
      <p style={{ marginTop: 12 }}>{t("auth.noAccount")} <Link href="/register">{t("auth.register")}</Link></p>
    </main>
  );
}
