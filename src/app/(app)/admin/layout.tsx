import { requireOwnerPage } from "@/lib/auth/guards";

// Server-enforced Owner gate for every /admin route. Combined with middleware
// and per-action assertOwner(), Admin cannot be reached by non-Owners even by
// navigating directly to the URL or calling the server actions.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage();
  return <>{children}</>;
}
