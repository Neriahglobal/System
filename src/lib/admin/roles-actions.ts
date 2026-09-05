"use server";

import { revalidatePath } from "next/cache";
import { assertOwner } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { OWNER_ROLE } from "@/lib/auth/permissions";

export interface RoleActionResult {
  ok: boolean;
  error?: string;
}

export async function setRolePermissions(
  roleId: string,
  permissionCodes: string[],
): Promise<RoleActionResult> {
  let user;
  try {
    user = await assertOwner();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized." };
  }

  const admin = createAdminClient();

  const { data: role } = await admin
    .from("roles")
    .select("id, code")
    .eq("id", roleId)
    .maybeSingle();
  if (!role) return { ok: false, error: "Role not found." };
  if (role.code === OWNER_ROLE) {
    return { ok: false, error: "The Owner role is protected and always has full access." };
  }

  const { data: perms } = await admin
    .from("permissions")
    .select("id, code")
    .in("code", permissionCodes.length ? permissionCodes : ["__none__"]);
  const permIds = (perms ?? []).map((p) => p.id);

  // Replace the role's permission set.
  await admin.from("role_permissions").delete().eq("role_id", roleId);
  if (permIds.length) {
    const rows = permIds.map((pid) => ({ role_id: roleId, permission_id: pid }));
    const { error } = await admin.from("role_permissions").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  await writeAuditLog({
    userId: user.id,
    action: "role.update_permissions",
    resourceType: "role",
    resourceId: roleId,
    newValues: { permissions: permissionCodes },
  });

  revalidatePath("/admin/roles");
  return { ok: true };
}
