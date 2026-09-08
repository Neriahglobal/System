"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Send, Trash2, Ban } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Res = { ok: boolean; error?: string };

export function TxnActions({
  id, status, canPost, canOwner,
  postAction, deleteAction, voidAction,
  postLabel = "Post", afterDeletePush,
  extraItems = [],
}: {
  id: string;
  status: string;
  canPost?: boolean;
  canOwner?: boolean;
  postAction?: (id: string) => Promise<Res>;
  deleteAction?: (id: string, reason: string) => Promise<Res>;
  voidAction?: (id: string, reason: string) => Promise<Res>;
  postLabel?: string;
  afterDeletePush?: string;
  extraItems?: { label: string; href: string }[];
}) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState<null | "delete" | "void">(null);

  async function doPost() {
    if (!postAction) return;
    const res = await postAction(id);
    if (res.ok) { toast.success("Posted."); router.refresh(); } else toast.error(res.error ?? "Failed.");
  }
  async function onConfirm(reason: string) {
    const fn = confirm === "delete" ? deleteAction : voidAction;
    if (!fn) return "Not available.";
    const res = await fn(id, reason);
    if (!res.ok) return res.error ?? "Failed.";
    toast.success(confirm === "delete" ? "Draft deleted." : "Voided.");
    if (confirm === "delete" && afterDeletePush) router.push(afterDeletePush);
    else router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {extraItems.map((it) => (
            <DropdownMenuItem key={it.href} asChild><Link href={it.href}>{it.label}</Link></DropdownMenuItem>
          ))}
          {status === "draft" && canPost && postAction && (
            <DropdownMenuItem onClick={doPost}><Send className="h-4 w-4" /> {postLabel}</DropdownMenuItem>
          )}
          {status === "draft" && canOwner && deleteAction && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
              <Trash2 className="h-4 w-4" /> Delete draft
            </DropdownMenuItem>
          )}
          {status === "posted" && canOwner && voidAction && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm("void")}>
              <Ban className="h-4 w-4" /> Void
            </DropdownMenuItem>
          )}
          {status === "voided" && <DropdownMenuItem disabled>Voided</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "delete" ? "Delete this draft?" : "Void this document?"}
        description={confirm === "delete"
          ? "The draft is permanently removed and recorded in the audit log."
          : "A reversing entry is created. The original document stays visible and its number is never reused."}
        confirmLabel={confirm === "delete" ? "Delete" : "Void"}
        destructive requireReason onConfirm={onConfirm}
      />
    </>
  );
}
