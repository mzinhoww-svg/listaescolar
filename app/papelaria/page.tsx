import { AreaPage } from "@/components/auth/AreaPage";
import { requireAccess } from "@/features/auth/guard";

export default async function Page() {
  const { user, role } = await requireAccess("/papelaria");
  return <AreaPage title="Papelaria" email={user.email} role={role} />;
}
