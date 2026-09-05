import type { Metadata } from "next";
import { requireOwnerPage } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { RolesManager, type PermRow, type RoleRow } from "./roles-manager";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default async function RolesPage() {
  await requireOwnerPage();
  const admin = createAdminClient();

  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    admin
      .from("roles")
      .select("id, code, name, description, is_protected")
      .order("is_protected", { ascending: false })
      .order("name"),
    admin.from("permissions").select("code, resource, action").order("resource"),
    admin.from("role_permissions").select("role_id, permission:permissions(code)"),
  ]);

  const rolePermissions: Record<string, string[]> = {};
  for (const row of (rp ?? []) as unknown as {
    role_id: string;
    permission: { code: string } | { code: string }[] | null;
  }[]) {
    if (!row.permission) continue;
    const perm = Array.isArray(row.permission) ? row.permission[0] : row.permission;
    if (!perm) continue;
    (rolePermissions[row.role_id] ??= []).push(perm.code);
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Define what each role can do. The Owner role is protected."
      />
      <RolesManager
        roles={(roles ?? []) as RoleRow[]}
        permissions={(perms ?? []) as PermRow[]}
        rolePermissions={rolePermissions}
      />
    </div>
  );
}
