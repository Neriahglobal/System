"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setActiveBranch } from "@/lib/auth/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BranchOption {
  id: string;
  name: string;
  code: string;
}

export function BranchSelector({
  branches,
  activeBranchId,
}: {
  branches: BranchOption[];
  activeBranchId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [value, setValue] = React.useState(activeBranchId ?? undefined);

  if (branches.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">No branch assigned</span>
    );
  }

  async function onChange(next: string) {
    setValue(next);
    setPending(true);
    try {
      await setActiveBranch(next);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch branch");
      setValue(activeBranchId ?? undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-[190px] text-sm">
        <SelectValue placeholder="Select branch" />
      </SelectTrigger>
      <SelectContent>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name} ({b.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
