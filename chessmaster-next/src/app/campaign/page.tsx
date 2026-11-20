import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { CampaignClient } from "./CampaignClient";

export default async function CampaignPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/campaign");
  return <CampaignClient />;
}
