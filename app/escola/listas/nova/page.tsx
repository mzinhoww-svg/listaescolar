import Link from "next/link";
import { z } from "zod";

import { SchoolShell } from "@/components/submissions/SchoolShell";
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
    <SchoolShell email={user.email}>
      {mine === null ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">Não foi possível carregar suas escolas. Tente de novo.</p>
      ) : mine.length === 0 ? (
        <p role="note" className="bg-campo rounded-campo px-4 py-3 text-[14px] font-bold">
          Você ainda não tem escola vinculada. <Link href="/escolas" className="underline">Encontre a escola e reivindique o acesso</Link> para enviar a lista.
        </p>
      ) : (
        <SchoolUploadForm
          schools={mine.map((s) => ({ id: s.schoolId, name: s.name, inep: s.inep }))}
          initialSchoolId={initial.success ? initial.data : null}
          years={[y, y + 1]}
          defaultYear={now.getMonth() >= 7 ? y + 1 : y}
        />
      )}
    </SchoolShell>
  );
}
