"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOwner } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getPrimaryCompanyId } from "@/lib/admin/queries";

const schema = z.object({
  name: z.string().min(1, "Company name is required."),
  legal_name: z.string().optional(),
  base_currency: z.string().min(1).max(8),
  timezone: z.string().min(1),
  date_format: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().or(z.literal("")).optional(),
  address: z.string().optional(),
});

export interface CompanyState {
  ok?: boolean;
  error?: string;
}

export async function updateCompany(
  _prev: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  let user;
  try {
    user = await assertOwner();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const companyId = await getPrimaryCompanyId(user.defaultCompanyId);
  const admin = createAdminClient();

  const { data: before } = await admin
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();

  const payload = {
    ...parsed.data,
    legal_name: parsed.data.legal_name || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    address: parsed.data.address || null,
    updated_by: user.id,
  };

  const { error } = await admin.from("companies").update(payload).eq("id", companyId);
  if (error) return { error: error.message };

  await writeAuditLog({
    userId: user.id,
    companyId,
    action: "master.update",
    resourceType: "company",
    resourceId: companyId,
    oldValues: before,
    newValues: payload,
  });

  revalidatePath("/admin/company");
  return { ok: true };
}
