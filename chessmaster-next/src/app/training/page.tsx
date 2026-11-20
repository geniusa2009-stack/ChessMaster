import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { TrainingClient } from "./TrainingClient";

export default async function TrainingPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/training");
  return <TrainingClient />;
}
