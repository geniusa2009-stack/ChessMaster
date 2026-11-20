import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { OnlineClient } from "./OnlineClient";

export default async function OnlinePage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/play/online");
  return <OnlineClient />;
}
