import type { Metadata } from "next";
import { requireActiveUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileForm, PasswordForm } from "./account-forms";

export const metadata: Metadata = { title: "My Account" };

export default async function AccountPage() {
  const user = await requireActiveUser();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div>
      <PageHeader title="My Account" description="Manage your profile and password." />

      <div className="mb-4">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
              <p className="font-medium">{user.role?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <Badge variant={user.isActive ? "success" : "muted"}>
                {user.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            {user.isPrimaryOwner && (
              <Badge variant="default">Primary Owner</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProfileForm fullName={user.fullName ?? ""} phone={profile?.phone ?? ""} />
        <PasswordForm />
      </div>
    </div>
  );
}
