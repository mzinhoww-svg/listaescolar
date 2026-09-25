import { AreaPage } from "@/components/auth/AreaPage";
import { requireAccess } from "@/features/auth/guard";

export default async function Page() {
  const { user, role } = await requireAccess("/conta");
  return <AreaPage title="Minha conta" email={user.email} role={role} />;
}
