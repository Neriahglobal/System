import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OWNER_ROLE } from "@/lib/auth/permissions";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  hasProfile: boolean;
  isPrimaryOwner: boolean;
  isOwner: boolean;
  role: { id: string; code: string; name: string } | null;
  permissions: Set<string>;
  companyIds: string[];
  branchIds: string[];
  defaultCompanyId: string | null;
  defaultBranchId: string | null;
}

/**
 * Loads the fully-resolved current user for the request. The auth identity is
 * verified against Supabase (getUser revalidates the JWT); the profile, role,
 * permissions and access lists are then loaded with the service-role client
 * keyed strictly by that verified id. Never trust ids supplied by the browser.
 *
 * Memoized per-request with React cache().
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("user_profiles")
    .select(
      "id, email, full_name, is_active, is_primary_owner, role:roles(id, code, name)",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Authenticated but no application profile - treated as unauthorized.
    return {
      id: user.id,
      email: user.email ?? "",
      fullName: null,
      isActive: false,
      hasProfile: false,
      isPrimaryOwner: false,
      isOwner: false,
      role: null,
      permissions: new Set(),
      companyIds: [],
      branchIds: [],
      defaultCompanyId: null,
      defaultBranchId: null,
    };
  }

  const role = (profile.role as unknown as {
    id: string;
    code: string;
    name: string;
  } | null) ?? null;
  const isOwner = role?.code === OWNER_ROLE;

  const [{ data: perms }, { data: companies }, { data: branches }, { data: prof2 }] =
    await Promise.all([
      role
        ? admin
            .from("role_permissions")
            .select("permission:permissions(code)")
            .eq("role_id", role.id)
        : Promise.resolve({ data: [] as unknown[] }),
      admin.from("user_company_access").select("company_id").eq("user_id", user.id),
      admin.from("user_branch_access").select("branch_id").eq("user_id", user.id),
      admin
        .from("user_profiles")
        .select("default_company_id, default_branch_id")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  const permissions = new Set<string>(
    ((perms as { permission: { code: string } | null }[] | null) ?? [])
      .map((r) => r.permission?.code)
      .filter((c): c is string => Boolean(c)),
  );

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    isActive: profile.is_active,
    hasProfile: true,
    isPrimaryOwner: profile.is_primary_owner,
    isOwner,
    role,
    permissions,
    companyIds: ((companies as { company_id: string }[] | null) ?? []).map(
      (c) => c.company_id,
    ),
    branchIds: ((branches as { branch_id: string }[] | null) ?? []).map(
      (b) => b.branch_id,
    ),
    defaultCompanyId: prof2?.default_company_id ?? null,
    defaultBranchId: prof2?.default_branch_id ?? null,
  };
});

export function userHasPermission(user: CurrentUser, code: string): boolean {
  return user.isOwner || user.permissions.has(code);
}
