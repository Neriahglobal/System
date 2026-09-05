"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOwner } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { OWNER_ROLE } from "@/lib/auth/permissions";

export interface UserResult {
  ok: boolean;
  error?: string;
}

const baseSchema = z.object({
  fullName: z.string().min(1, "Full name is required."),
  roleId: z.string().uuid("Select a role."),
  companyIds: z.array(z.string().uuid()).min(1, "Assign at least one company."),
  branchIds: z.array(z.string().uuid()),
  defaultBranchId: z.string().uuid().nullable().optional(),
  isActive: z.boolean(),
});

async function assertRoleNotOwner(roleId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: role } = await admin
    .from("roles")
    .select("code")
    .eq("id", roleId)
    .maybeSingle();
  if (!role) return "Selected role does not exist.";
  if (role.code === OWNER_ROLE) {
    return "The Owner role cannot be assigned through the users form.";
  }
  return null;
}

/** Ensure selected branches belong to selected companies (no cross-company). */
async function validateBranchScope(
  companyIds: string[],
  branchIds: string[],
): Promise<string | null> {
  if (branchIds.length === 0) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("branches")
    .select("id, company_id")
    .in("id", branchIds);
  for (const b of data ?? []) {
    if (!companyIds.includes(b.company_id)) {
      return "A selected branch does not belong to the selected company.";
    }
  }
  return null;
}

async function replaceAccess(
  userId: string,
  ownerId: string,
  companyIds: string[],
  branchIds: string[],
  defaultBranchId: string | null,
) {
  const admin = createAdminClient();
  await admin.from("user_company_access").delete().eq("user_id", userId);
  await admin.from("user_branch_access").delete().eq("user_id", userId);
  if (companyIds.length) {
    await admin.from("user_company_access").insert(
      companyIds.map((cid) => ({ user_id: userId, company_id: cid, created_by: ownerId })),
    );
  }
  if (branchIds.length) {
    await admin.from("user_branch_access").insert(
      branchIds.map((bid) => ({
        user_id: userId,
        branch_id: bid,
        is_default: bid === defaultBranchId,
        created_by: ownerId,
      })),
    );
  }
}

export async function createUser(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  roleId: string;
  companyIds: string[];
  branchIds: string[];
  defaultBranchId: string | null;
  isActive: boolean;
}): Promise<UserResult> {
  let owner;
  try {
    owner = await assertOwner();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized." };
  }

  const email = input.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Initial password must be at least 8 characters." };
  }
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const roleErr = await assertRoleNotOwner(input.roleId);
  if (roleErr) return { ok: false, error: roleErr };
  const scopeErr = await validateBranchScope(input.companyIds, input.branchIds);
  if (scopeErr) return { ok: false, error: scopeErr };

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? "";
    if (/already/i.test(msg)) return { ok: false, error: "A user with this email already exists." };
    return { ok: false, error: msg || "Could not create the user." };
  }

  const userId = created.user.id;
  const defaultBranchId =
    input.defaultBranchId && input.branchIds.includes(input.defaultBranchId)
      ? input.defaultBranchId
      : (input.branchIds[0] ?? null);

  const { error: profErr } = await admin.from("user_profiles").insert({
    id: userId,
    email,
    full_name: input.fullName,
    phone: input.phone || null,
    role_id: input.roleId,
    default_company_id: input.companyIds[0] ?? null,
    default_branch_id: defaultBranchId,
    is_active: input.isActive,
    is_primary_owner: false,
    created_by: owner.id,
    updated_by: owner.id,
  });
  if (profErr) {
    // Roll back the auth user to avoid an orphaned account.
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: profErr.message };
  }

  await replaceAccess(userId, owner.id, input.companyIds, input.branchIds, defaultBranchId);

  await writeAuditLog({
    userId: owner.id,
    action: "user.create",
    resourceType: "user_profiles",
    resourceId: userId,
    newValues: {
      email,
      full_name: input.fullName,
      role_id: input.roleId,
      company_ids: input.companyIds,
      branch_ids: input.branchIds,
      is_active: input.isActive,
    },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUser(
  userId: string,
  input: {
    fullName: string;
    phone?: string;
    roleId: string;
    companyIds: string[];
    branchIds: string[];
    defaultBranchId: string | null;
    isActive: boolean;
  },
): Promise<UserResult> {
  let owner;
  try {
    owner = await assertOwner();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "User not found." };

  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // Protect the primary Owner from role change / deactivation.
  if (target.is_primary_owner) {
    if (input.roleId !== target.role_id) {
      return { ok: false, error: "The primary Owner's role cannot be changed." };
    }
    if (!input.isActive) {
      return { ok: false, error: "The primary Owner cannot be deactivated." };
    }
  } else {
    const roleErr = await assertRoleNotOwner(input.roleId);
    if (roleErr) return { ok: false, error: roleErr };
  }

  const scopeErr = await validateBranchScope(input.companyIds, input.branchIds);
  if (scopeErr) return { ok: false, error: scopeErr };

  const defaultBranchId =
    input.defaultBranchId && input.branchIds.includes(input.defaultBranchId)
      ? input.defaultBranchId
      : (input.branchIds[0] ?? null);

  const { error } = await admin
    .from("user_profiles")
    .update({
      full_name: input.fullName,
      phone: input.phone || null,
      role_id: input.roleId,
      default_company_id: input.companyIds[0] ?? null,
      default_branch_id: defaultBranchId,
      is_active: input.isActive,
      updated_by: owner.id,
    })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await replaceAccess(userId, owner.id, input.companyIds, input.branchIds, defaultBranchId);

  await writeAuditLog({
    userId: owner.id,
    action: "user.update",
    resourceType: "user_profiles",
    resourceId: userId,
    oldValues: {
      role_id: target.role_id,
      is_active: target.is_active,
    },
    newValues: {
      full_name: input.fullName,
      role_id: input.roleId,
      company_ids: input.companyIds,
      branch_ids: input.branchIds,
      is_active: input.isActive,
    },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
  reason: string,
): Promise<UserResult> {
  let owner;
  try {
    owner = await assertOwner();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized." };
  }

  if (userId === owner.id && !isActive) {
    return { ok: false, error: "You cannot deactivate your own account." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("user_profiles")
    .select("id, is_active, is_primary_owner")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "User not found." };
  if (target.is_primary_owner && !isActive) {
    return { ok: false, error: "The primary Owner cannot be deactivated." };
  }

  const { error } = await admin
    .from("user_profiles")
    .update({ is_active: isActive, updated_by: owner.id })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    userId: owner.id,
    action: isActive ? "user.activate" : "user.deactivate",
    resourceType: "user_profiles",
    resourceId: userId,
    oldValues: { is_active: target.is_active },
    newValues: { is_active: isActive },
    reason: reason || null,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function sendPasswordReset(userId: string): Promise<UserResult> {
  let owner;
  try {
    owner = await assertOwner();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("user_profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "User not found." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(target.email);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    userId: owner.id,
    action: "user.password_reset",
    resourceType: "user_profiles",
    resourceId: userId,
  });

  return { ok: true };
}
