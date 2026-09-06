"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Send, Trash2, Ban } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  postOpening, voidOpening, deleteOpeningDraft,
  postAdjustment, voidAdjustment, deleteAdjustmentDraft,
} from "@/lib/inventory/actions";

type Kind = "opening" | "adjustment";
const FN = {
  opening: { post: postOpening, void: voidOpening, del: deleteOpeningDraft },
  adjustment: { post: postAdjustment, void: voidAdjustment, del: deleteAdjustmentDraft },
};

export function InventoryDocActions({
  kind, id, status, canPost, canOwner,
}: {
  kind: Kind; id: string; status: string; canPost: boolean; canOwner: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState<null | "delete" | "void">(null);
  const fns = FN[kind];

  async function doPost() {
    const res = await fns.post(id);
    if (res.ok) { toast.success("Posted."); router.refresh(); }
    else toast.error(res.error ?? "Failed.");
  }
  async function onConfirm(reason: string) {
    const res = confirm === "delete" ? await fns.del(id, reason) : await fns.void(id, reason);
    if (!res.ok) return res.error ?? "Failed.";
    toast.success(confirm === "delete" ? "Draft deleted." : "Voided.");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "draft" && canPost && (
            <DropdownMenuItem onClick={doPost}><Send className="h-4 w-4" /> Post</DropdownMenuItem>
          )}
          {status === "draft" && canOwner && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
              <Trash2 className="h-4 w-4" /> Delete draft
            </DropdownMenuItem>
          )}
          {status === "posted" && canOwner && (
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
          ? "The draft will be permanently removed. This is recorded in the audit log."
          : "A reversing entry will restore stock and accounting. The original stays visible."}
        confirmLabel={confirm === "delete" ? "Delete" : "Void"}
        destructive requireReason
        onConfirm={onConfirm}
      />
    </>
  );
}
