import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { PlayClient } from "./PlayClient";

// Server Component gate: only authenticated users reach the board (rewards need a user).
export default async function PlayPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/play");
  return <PlayClient username={profile.username} rating={profile.rating ?? 800} />;
}
