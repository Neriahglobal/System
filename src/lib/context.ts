import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, userHasPermission, type CurrentUser } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/guards";
import { getPrimaryCompanyId } from "@/lib/admin/queries";
import { ACTIVE_BRANCH_COOKIE } from "@/lib/auth/constants";

export interface ActiveContext {
  user: CurrentUser;
  companyId: string;
  branchId: string | null;
  branches: { id: string; name: string; code: string }[];
}

/**
 * Resolve the request's active company + branch for the signed-in user.
 * Branch = cookie (if accessible) else default else first accessible. All
 * branch ids are validated against the user's access - never trusted blindly.
 */
export async function getActiveContext(): Promise<ActiveContext> {
  const user = await getCurrentUser();
  if (!user) throw new AuthzError("UNAUTHENTICATED", "You must sign in.");
  if (!user.hasProfile || !user.isActive) {
    throw new AuthzError("INACTIVE", "Your account is not active.");
  }

  const companyId = await getPrimaryCompanyId(user.defaultCompanyId);
  const admin = createAdminClient();
  const { data } = await admin
    .from("branches")
    .select("id, name, code")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("code");

  const all = (data ?? []) as { id: string; name: string; code: string }[];
  const branches = user.isOwner ? all : all.filter((b) => user.branchIds.includes(b.id));
  const accessible = new Set(branches.map((b) => b.id));

  const store = await cookies();
  const cookieBranch = store.get(ACTIVE_BRANCH_COOKIE)?.value;
  const branchId =
    cookieBranch && accessible.has(cookieBranch)
      ? cookieBranch
      : user.defaultBranchId && accessible.has(user.defaultBranchId)
        ? user.defaultBranchId
        : (branches[0]?.id ?? null);

  return { user, companyId, branchId, branches };
}

export function can(user: CurrentUser, code: string): boolean {
  return userHasPermission(user, code);
}
