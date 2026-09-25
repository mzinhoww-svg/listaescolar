import { AreaPage } from "@/components/auth/AreaPage";
import { requireAccess } from "@/features/auth/guard";

export default async function Page() {
  const { user, role } = await requireAccess("/escola");
  return <AreaPage title="Escola" email={user.email} role={role} />;
}
