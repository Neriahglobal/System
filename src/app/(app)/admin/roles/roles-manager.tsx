"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShieldCheck, Lock } from "lucide-react";
import { setRolePermissions } from "@/lib/admin/roles-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_protected: boolean;
}
export interface PermRow {
  code: string;
  resource: string;
  action: string;
}

export function RolesManager({
  roles,
  permissions,
  rolePermissions,
}: {
  roles: RoleRow[];
  permissions: PermRow[];
  rolePermissions: Record<string, string[]>;
}) {
  const [selectedId, setSelectedId] = React.useState(roles[0]?.id ?? "");
  const [checked, setChecked] = React.useState<Set<string>>(
    () => new Set(rolePermissions[roles[0]?.id] ?? []),
  );
  const [pending, setPending] = React.useState(false);

  const selected = roles.find((r) => r.id === selectedId);
  const isOwner = selected?.code === "OWNER";

  React.useEffect(() => {
    setChecked(new Set(rolePermissions[selectedId] ?? []));
  }, [selectedId, rolePermissions]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, PermRow[]>();
    for (const p of permissions) {
      if (!map.has(p.resource)) map.set(p.resource, []);
      map.get(p.resource)!.push(p);
    }
    return Array.from(map.entries());
  }, [permissions]);

  function toggle(code: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setPending(true);
    const res = await setRolePermissions(selected.id, Array.from(checked));
    setPending(false);
    if (res.ok) toast.success(`Permissions updated for ${selected.name}.`);
    else toast.error(res.error ?? "Could not save.");
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit">
        <CardContent className="p-2">
          <ul className="space-y-1">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    selectedId === r.id && "bg-accent",
                  )}
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      {r.name}
                      {r.is_protected && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {(rolePermissions[r.id] ?? []).length} permissions
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          {selected && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    {selected.name}
                    {selected.is_protected && <Badge variant="muted">Protected</Badge>}
                  </h2>
                  <p className="text-sm text-muted-foreground">{selected.description}</p>
                </div>
                {!isOwner && (
                  <Button onClick={save} disabled={pending}>
                    {pending ? "Saving..." : "Save permissions"}
                  </Button>
                )}
              </div>

              {isOwner && (
                <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  The Owner role always has full access to every module and cannot
                  be modified.
                </p>
              )}

              <div className="space-y-5">
                {grouped.map(([resource, perms]) => (
                  <div key={resource}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {resource.replace(/_/g, " ")}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {perms.map((p) => {
                        const on = isOwner || checked.has(p.code);
                        return (
                          <label
                            key={p.code}
                            className={cn(
                              "flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm",
                              isOwner ? "opacity-70" : "cursor-pointer hover:bg-muted",
                            )}
                          >
                            <Checkbox
                              checked={on}
                              disabled={isOwner || pending}
                              onCheckedChange={() => toggle(p.code)}
                            />
                            <span className="capitalize">{p.action.replace(/_/g, " ")}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
