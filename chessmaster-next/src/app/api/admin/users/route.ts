import { NextResponse } from "next/server";
import { getAuthedProfile, isAdmin } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminUsersQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

// GET: paginated/sorted/searched user list (admin only). Sort key is a whitelisted enum and
// page size is bounded, so user-controlled params can't drive arbitrary SQL or unbounded reads.
// Explicit columns only — no select-all, no auth credential columns.
export async function GET(req: Request) {
  const profile = await getAuthedProfile();
  if (!isAdmin(profile)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const url = new URL(req.url);
  const parsed = adminUsersQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 422 });
  const { page, pageSize, sort, search } = parsed.data;
  const offset = (page - 1) * pageSize;

  const admin = createAdminClient();
  let q = admin.from("profiles").select("id, username, email, role, xp, rating, wins, losses, created_at", { count: "exact" });
  if (search) q = q.ilike("username", `%${search.replace(/[%_]/g, "")}%`); // sanitize wildcards
  const { data, count, error } = await q
    .order(sort, { ascending: sort === "username" })
    .range(offset, offset + pageSize - 1);
  if (error) return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });

  return NextResponse.json({
    users: data ?? [],
    page, pageSize, total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  });
}
