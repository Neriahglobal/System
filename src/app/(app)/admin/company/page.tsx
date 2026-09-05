import type { Metadata } from "next";
import { requireOwnerPage } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrimaryCompanyId } from "@/lib/admin/queries";
import { PageHeader } from "@/components/ui/page-header";
import { CompanyForm, type CompanyValues } from "./company-form";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  const user = await requireOwnerPage();
  const admin = createAdminClient();
  const companyId = await getPrimaryCompanyId(user.defaultCompanyId);

  const { data } = await admin
    .from("companies")
    .select("code, name, legal_name, base_currency, timezone, date_format, phone, email, address")
    .eq("id", companyId)
    .single();

  return (
    <div>
      <PageHeader title="Company" description="Company profile and default settings." />
      <CompanyForm company={data as CompanyValues} />
    </div>
  );
}
