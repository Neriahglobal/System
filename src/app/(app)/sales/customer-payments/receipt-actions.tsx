"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Printer, Ban } from "lucide-react";
import { voidReceipt } from "@/lib/sales/receipts-actions";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function ReceiptActions({ id, status, canVoid }: { id: string; status: string; canVoid: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);

  async function onVoid(reason: string) {
    const res = await voidReceipt(id, reason);
    if (!res.ok) return res.error ?? "Failed.";
    toast.success("Receipt voided."); router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "posted" && (
            <DropdownMenuItem asChild><Link href={`/receipt/${id}`} target="_blank"><Printer className="h-4 w-4" /> Print</Link></DropdownMenuItem>
          )}
          {status === "posted" && canVoid && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}><Ban className="h-4 w-4" /> Void</DropdownMenuItem>
          )}
          {status === "voided" && <DropdownMenuItem disabled>Voided</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm}
        title="Void this receipt?" description="Reversing entries restore the customer's outstanding balance."
        confirmLabel="Void" destructive requireReason onConfirm={onVoid} />
    </>
  );
}
