import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const REDACT_KEYS = [
  "password",
  "pass",
  "token",
  "secret",
  "access_token",
  "refresh_token",
  "service_role_key",
  "anon_key",
  "api_key",
  "apikey",
  "authorization",
];

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.includes(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export interface AuditEntry {
  userId: string;
  companyId?: string | null;
  branchId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string | null;
}

/**
 * Appends an immutable audit-log record. Secrets are redacted before storage.
 * Request metadata (IP, user agent) is captured best-effort. Audit writes use
 * the service-role client and go through an append-only table (no update/delete
 * policies exist), so records cannot be altered through the application.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null;
      userAgent = h.get("user-agent");
    } catch {
      // headers() not available in this context - fine.
    }

    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      user_id: entry.userId,
      company_id: entry.companyId ?? null,
      branch_id: entry.branchId ?? null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      old_values: entry.oldValues ? redact(entry.oldValues) : null,
      new_values: entry.newValues ? redact(entry.newValues) : null,
      reason: entry.reason ?? null,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (err) {
    // Never let an audit failure crash the primary action, but make it visible.
    console.error("[audit] failed to write audit log", err);
  }
}
