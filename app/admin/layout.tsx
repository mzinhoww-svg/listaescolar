import { requireAccess } from "@/features/auth/guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAccess("/admin");
  return children;
}
