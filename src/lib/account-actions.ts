"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertActiveUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";

export interface AccountResult {
  ok: boolean;
  error?: string;
}

const profileSchema = z.object({
  fullName: z.string().min(1, "Name is required."),
  phone: z.string().optional(),
});

export async function updateOwnProfile(input: {
  fullName: string;
  phone?: string;
}): Promise<AccountResult> {
  let user;
  try {
    user = await assertActiveUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized." };
  }
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_profiles")
    .update({ full_name: input.fullName, phone: input.phone || null, updated_by: user.id })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    userId: user.id,
    action: "profile.update",
    resourceType: "user_profiles",
    resourceId: user.id,
  });

  revalidatePath("/account");
  return { ok: true };
}

export async function changeOwnPassword(newPassword: string): Promise<AccountResult> {
  let user;
  try {
    user = await assertActiveUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    userId: user.id,
    action: "profile.password_change",
    resourceType: "user_profiles",
    resourceId: user.id,
  });

  return { ok: true };
}
