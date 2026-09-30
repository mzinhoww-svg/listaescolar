import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { MySchoolsTable } from "@/components/claims/MySchoolsTable";
import { SchoolPanelShell } from "@/components/claims/SchoolPanelShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listMyPendingClaims, listMySchools, listPublishedListLinks, type MyClaimRow, type MySchoolRow, type PublishedListLink } from "@/features/claims/queries-mine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minhas escolas · ListaCerta" };

/** Escola03. Papel `school_member`/`admin` (o acesso é decidido em `features/auth/access.ts`, que a S06 não altera). */
export default async function Page() {
  const { user } = await requireAccess("/escola");
  let data: { schools: MySchoolRow[]; claims: MyClaimRow[]; listLinks: ReadonlyMap<string, PublishedListLink> } | null = null;
  try {
    const actor = await getSessionActor();
    if (actor) {
      const [schools, claims] = await Promise.all([listMySchools(actor), listMyPendingClaims(actor)]);
      const linked = new Set(schools.map((s) => s.inep));
      const seen = new Set<string>();
      // Só a reivindicação mais recente de cada escola, e nenhuma de escola que o usuário já administra.
      const latest = claims.filter((c) => !linked.has(c.school.inep) && !seen.has(c.school.inep) && seen.add(c.school.inep));
      data = { schools, claims: latest, listLinks: await listPublishedListLinks(schools) };
    }
  } catch (error) {
    console.error("minhas escolas", error instanceof Error ? error.message : "erro");
  }
  return (
    <SchoolPanelShell
      email={user.email}
      crumb="Painel"
      title="Minhas escolas"
      actions={<Link href="/escolas" className={buttonClass("outline")}>Pedir para administrar outra escola</Link>}
    >
      {data ? (
        <MySchoolsTable schools={data.schools} claims={data.claims} withList={new Set(data.listLinks.keys())} listLinks={data.listLinks} />
      ) : (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Não foi possível carregar suas escolas. <Link href="/escola" className="underline">Tentar de novo</Link>
        </p>
      )}
    </SchoolPanelShell>
  );
}
