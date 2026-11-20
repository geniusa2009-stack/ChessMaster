import { redirect } from "next/navigation";
import { getAuthedProfile, isAdmin } from "@/lib/auth/getUser";
import { AdminClient } from "./AdminClient";

// Server-side gate: non-admins are redirected before any admin data is loaded. The admin APIs
// ALSO re-check authorization independently — hiding the UI is never the security boundary.
export default async function AdminPage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/admin");
  if (!isAdmin(profile)) redirect("/");
  return <AdminClient />;
}
