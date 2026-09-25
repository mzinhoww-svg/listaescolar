import Link from "next/link";

import { AreaPage } from "@/components/auth/AreaPage";
import { requireAccess } from "@/features/auth/guard";

export default async function Page() {
  const { user, role } = await requireAccess("/admin");
  return (
    <>
      <AreaPage title="Administração" email={user.email} role={role} />
      <Link href="/admin/importacoes" className="text-verde-fundo mx-auto pb-10 text-[15px] font-extrabold underline">
        Importações de escolas
      </Link>
    </>
  );
}
