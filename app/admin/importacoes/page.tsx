import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { BatchTable } from "@/components/admin/BatchTable";
import { CountCard } from "@/components/admin/CountCard";
import { requireAccess } from "@/features/auth/guard";
import { countSchools, listBatches } from "@/features/schools/queries";

import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const [schools, batches] = await Promise.all([countSchools(), listBatches()]);
    return { ok: true as const, schools, batches };
  } catch {
    return { ok: false as const };
  }
}

export default async function Page() {
  const { user } = await requireAccess("/admin/importacoes");
  const data = await load();
  return (
    <AdminShell active="/admin/importacoes" email={user.email} breadcrumb="Admin / Importações" title="Importações">
      {data.ok ? (
        <>
          <div className="grid max-w-xl grid-cols-2 gap-3">
            <CountCard label="Escolas reais" value={data.schools.real} hint="Contagem direta do banco" />
            <CountCard label="Escolas de demonstração" value={data.schools.demo} hint="Marcadas como Demonstração" />
          </div>
          <UploadForm />
          <BatchTable batches={data.batches} />
        </>
      ) : (
        <div role="alert" className="rounded-card flex flex-col items-start gap-3 bg-red-50 px-6 py-6 text-red-900">
          <p className="font-extrabold">Não foi possível carregar as importações.</p>
          <Link href="/admin/importacoes" className="rounded-botao border-[1.5px] border-red-900 px-4 py-1.5 text-sm font-extrabold">
            Tentar novamente
          </Link>
        </div>
      )}
    </AdminShell>
  );
}
