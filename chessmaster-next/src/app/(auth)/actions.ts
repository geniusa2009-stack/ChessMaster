"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Supabase Auth handles password hashing, sessions, and reset — no client-side crypto.
export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=" + encodeURIComponent("Invalid credentials"));
  redirect("/");
}

export async function registerAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const username = String(formData.get("username") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email, password, options: { data: { username } },
  });
  if (error) redirect("/register?error=" + encodeURIComponent(error.message));
  redirect("/login?registered=1");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
