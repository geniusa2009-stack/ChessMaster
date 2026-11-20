import { createClient } from "@/lib/supabase/server";

export type Role = "user" | "moderator" | "admin" | "super_admin";
export interface AuthedProfile {
  id: string;
  email: string | null;
  username: string;
  role: Role;
  rating: number;
}

// Identity + role come from the SERVER session and the DB — never from a
// client-supplied object. Returns null if unauthenticated.
export async function getAuthedProfile(): Promise<AuthedProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles").select("id, email, username, role, rating").eq("id", user.id).single();
  return (profile as AuthedProfile) ?? null;
}

export function isAdmin(p: AuthedProfile | null): boolean {
  return !!p && (p.role === "admin" || p.role === "super_admin");
}
