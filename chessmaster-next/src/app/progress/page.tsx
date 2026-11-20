import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { ProgressClient } from "./ProgressClient";

export default async function ProgressPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/progress");
  return <ProgressClient />;
}
