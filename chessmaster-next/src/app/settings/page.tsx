import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/settings");
  return <SettingsClient />;
}
