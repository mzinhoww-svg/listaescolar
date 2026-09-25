import { AdminShell } from "@/components/admin/AdminShell";

export default function Loading() {
  return (
    <AdminShell active="/admin/importacoes" email={null} breadcrumb="Admin / Importações" title="Importações">
      <div role="status" aria-label="Carregando importações" className="flex flex-1 items-center justify-center">
        <div className="border-campo border-t-verde-certo size-12 animate-spin rounded-full border-4" />
      </div>
    </AdminShell>
  );
}
