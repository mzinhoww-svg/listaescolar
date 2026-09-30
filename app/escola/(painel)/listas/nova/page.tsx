import Link from "next/link";
import { z } from "zod";

import { SchoolPanelShell } from "@/components/claims/SchoolPanelShell";
import { buttonClass } from "@/components/ui/Button";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listMySchools } from "@/features/claims/queries-mine";

import { SchoolUploadForm } from "./SchoolUploadForm";

export const metadata = { title: "Enviar PDF da lista · ListaCerta" };
export const maxDuration = 30;

/** Envio da escola (D-002): só escolas vinculadas ao usuário (`school_members`); com uma só, já vem escolhida. */
export default async function Page({ searchParams }: { searchParams: Promise<{ escola?: string | string[] }> }) {
  const { user } = await requireAccess("/escola/listas/nova"); // school_member ou admin
  const { escola } = await searchParams;
  const initial = z.uuid().safeParse(Array.isArray(escola) ? escola[0] : escola);
  const actor = await getSessionActor();
  const mine = actor ? await listMySchools(actor).catch(() => null) : null;
  const now = new Date();
  const y = now.getFullYear();
  return (
    <SchoolPanelShell email={user.email} active="listas" crumb="Painel / Enviar lista" title="Enviar a lista da escola" back={{ href: "/escola", label: "Minhas escolas" }}>
      {mine === null ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">Não foi possível carregar suas escolas. <Link href="/escola/listas/nova" className="underline">Tentar de novo</Link></p>
      ) : mine.length === 0 ? (
        <div className="bg-campo rounded-campo flex flex-col items-start gap-3 px-4 py-4">
          <p role="note" className="text-[14px] font-bold">Você ainda não administra nenhuma escola. Peça para administrar a página da escola para enviar a lista.</p>
          <Link href="/escolas" className={buttonClass("primary")}>Buscar a escola</Link>
        </div>
      ) : (
        <SchoolUploadForm
          schools={mine.map((s) => ({ id: s.schoolId, name: s.name, inep: s.inep }))}
          initialSchoolId={initial.success ? initial.data : null}
          idempotencyKey={crypto.randomUUID()}
          years={[y, y + 1]}
          defaultYear={now.getMonth() >= 7 ? y + 1 : y}
        />
      )}
    </SchoolPanelShell>
  );
}
