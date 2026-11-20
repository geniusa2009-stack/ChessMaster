import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { PuzzlesClient } from "./PuzzlesClient";

export default async function PuzzlesPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/puzzles");
  return <PuzzlesClient />;
}
