import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { CertificatesClient } from "./CertificatesClient";

export default async function CertificatesPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/certificates");
  return <CertificatesClient />;
}
