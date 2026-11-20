import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { LeaderboardClient } from "./LeaderboardClient";

export default async function LeaderboardPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/leaderboard");
  return <LeaderboardClient />;
}
