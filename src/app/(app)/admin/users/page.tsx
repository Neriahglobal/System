import type { Metadata } from "next";
import { requireOwnerPage } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { UsersManager, type UserRow, type RefRow, type CompanyRow, type BranchRow } from "./users-manager";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const owner = await requireOwnerPage();
  const admin = createAdminClient();

  const [{ data: profiles }, { data: roles }, { data: companies }, { data: branches }, { data: uca }, { data: uba }] =
    await Promise.all([
      admin
        .from("user_profiles")
        .select("id, email, full_name, phone, is_active, is_primary_owner, role_id, default_branch_id, role:roles(name, code)")
        .order("created_at"),
      admin.from("roles").select("id, name, code").eq("is_active", true).order("name"),
      admin.from("companies").select("id, code, name").eq("is_active", true).order("code"),
      admin.from("branches").select("id, code, name, company_id").eq("is_active", true).order("code"),
      admin.from("user_company_access").select("user_id, company_id"),
      admin.from("user_branch_access").select("user_id, branch_id"),
    ]);

  const companyMap = new Map<string, string[]>();
  for (const r of uca ?? []) {
    const arr = companyMap.get(r.user_id) ?? [];
    arr.push(r.company_id);
    companyMap.set(r.user_id, arr);
  }
  const branchMap = new Map<string, string[]>();
  for (const r of uba ?? []) {
    const arr = branchMap.get(r.user_id) ?? [];
    arr.push(r.branch_id);
    branchMap.set(r.user_id, arr);
  }

  const users: UserRow[] = ((profiles ?? []) as unknown as Array<{
    id: string; email: string; full_name: string | null; phone: string | null;
    is_active: boolean; is_primary_owner: boolean; role_id: string | null;
    default_branch_id: string | null; role: { name: string; code: string } | null;
  }>).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    phone: p.phone,
    isActive: p.is_active,
    isPrimaryOwner: p.is_primary_owner,
    roleId: p.role_id,
    roleName: p.role?.name ?? "—",
    defaultBranchId: p.default_branch_id,
    companyIds: companyMap.get(p.id) ?? [],
    branchIds: branchMap.get(p.id) ?? [],
  }));

  return (
    <div>
      <PageHeader
        title="Users"
        description="Create users, assign roles and control company and branch access."
      />
      <UsersManager
        currentUserId={owner.id}
        users={users}
        roles={(roles ?? []) as RefRow[]}
        companies={(companies ?? []) as CompanyRow[]}
        branches={(branches ?? []) as BranchRow[]}
      />
    </div>
  );
}
