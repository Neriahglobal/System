import "server-only";

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  userHasPermission,
  type CurrentUser,
} from "@/lib/auth/session";

export type AuthzCode = "UNAUTHENTICATED" | "INACTIVE" | "FORBIDDEN";

/** Thrown by the assert* helpers used inside server actions / route handlers. */
export class AuthzError extends Error {
  code: AuthzCode;
  constructor(code: AuthzCode, message: string) {
    super(message);
    this.name = "AuthzError";
    this.code = code;
  }
}

/* ---------------------------------------------------------------------------
 * Page guards - redirect the visitor. Use inside Server Components / layouts.
 * ------------------------------------------------------------------------- */

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireActiveUser(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.hasProfile || !user.isActive) redirect("/unauthorized");
  return user;
}

export async function requireOwnerPage(): Promise<CurrentUser> {
  const user = await requireActiveUser();
  if (!user.isOwner) redirect("/unauthorized");
  return user;
}

export async function requirePermissionPage(code: string): Promise<CurrentUser> {
  const user = await requireActiveUser();
  if (!userHasPermission(user, code)) redirect("/unauthorized");
  return user;
}

/* ---------------------------------------------------------------------------
 * Action asserts - throw AuthzError. Use inside server actions & API routes so
 * a direct call cannot bypass the check even when the UI is hidden.
 * ------------------------------------------------------------------------- */

export async function assertActiveUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthzError("UNAUTHENTICATED", "You must sign in.");
  if (!user.hasProfile || !user.isActive) {
    throw new AuthzError("INACTIVE", "Your account is not active.");
  }
  return user;
}

export async function assertOwner(): Promise<CurrentUser> {
  const user = await assertActiveUser();
  if (!user.isOwner) {
    throw new AuthzError("FORBIDDEN", "Only the Owner can perform this action.");
  }
  return user;
}

export function assertCompanyAccess(user: CurrentUser, companyId: string): void {
  if (!user.isOwner && !user.companyIds.includes(companyId)) {
    throw new AuthzError("FORBIDDEN", "You do not have access to this company.");
  }
}

export function assertBranchAccess(user: CurrentUser, branchId: string): void {
  if (!user.isOwner && !user.branchIds.includes(branchId)) {
    throw new AuthzError("FORBIDDEN", "You do not have access to this branch.");
  }
}

export function assertPermission(user: CurrentUser, code: string): void {
  if (!userHasPermission(user, code)) {
    throw new AuthzError("FORBIDDEN", "You do not have permission for this action.");
  }
}
