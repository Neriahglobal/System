import { redirect } from "next/navigation";

export default function RootPage() {
  // Middleware normally redirects "/" already; this is the fallback.
  redirect("/dashboard");
}
