"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Building2, Loader2 } from "lucide-react";
import { signIn, type SignInState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-sidebar-foreground">Neriah ERP</h1>
        <p className="text-sm text-sidebar-muted">
          Neriah Global Group of Companies Limited
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your company account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {redirectTo && (
              <input type="hidden" name="redirectTo" value={redirectTo} />
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@neriahglobal.co.tz"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            {state.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}

            <SubmitButton />
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-sidebar-muted">
        Accounts are created by the Owner. There is no public sign-up.
      </p>
    </div>
  );
}
