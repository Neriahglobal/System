"use client";

import { signOut } from "@/lib/auth/actions";
import { LogOut } from "lucide-react";

export function SignOutMenuItem() {
  return (
    <form action={signOut} className="w-full">
      <button
        type="submit"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </form>
  );
}
