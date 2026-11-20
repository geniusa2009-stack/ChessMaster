import { redirect } from "next/navigation";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { FoundationsClient } from "./FoundationsClient";

export default async function FoundationsPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/foundations");
  return <FoundationsClient />;
}
