import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { OpeningsClient } from "./OpeningsClient";

export default async function OpeningsPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/openings");
  return <OpeningsClient />;
}
