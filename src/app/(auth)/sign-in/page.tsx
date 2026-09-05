import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const raw = sp.redirectedFrom;
  const redirectTo = typeof raw === "string" ? raw : undefined;
  return <SignInForm redirectTo={redirectTo} />;
}
