"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { ACTIVE_BRANCH_COOKIE } from "@/lib/auth/constants";

export async function signOut() {
  const user = await getCurrentUser();
  if (user) {
    await writeAuditLog({
      userId: user.id,
      action: "auth.sign_out",
      resourceType: "user_profiles",
      resourceId: user.id,
    });
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/** Persist the active branch, verifying the user actually has access to it. */
export async function setActiveBranch(branchId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!user.isOwner && !user.branchIds.includes(branchId)) {
    // Never trust a branch id the browser supplies.
    throw new Error("You do not have access to that branch.");
  }

  const store = await cookies();
  store.set(ACTIVE_BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}
