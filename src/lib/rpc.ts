import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface RpcResult {
  ok: boolean;
  id?: string;
  error?: string;
}

function cleanMessage(msg: string): string {
  // Our functions raise friendly messages; strip any leading context noise.
  return msg.replace(/^(ERROR:\s*)/i, "").trim();
}

/** Call a privileged posting function via the service-role client. */
export async function callPostingRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(fn, args);
  if (error) return { ok: false, error: cleanMessage(error.message) };
  return { ok: true, id: (data as string) ?? undefined };
}
