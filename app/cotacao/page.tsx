import type { Metadata } from "next";
import Link from "next/link";

import { Screen } from "@/components/auth/Screen";
import { BackHeader } from "@/components/cart/CartStates";
import { moneyOrUnavailable, formatWhen } from "@/components/leads/format";
import { DemoSeal, StatusBadge } from "@/components/leads/StatusBadge";
import { requireAccess } from "@/features/auth/guard";
import { errorMessageForCode } from "@/features/leads/messages";
import { listMyLeads } from "@/features/leads/queries";
import { getSessionActor } from "@/features/stationeries/actor";

export const metadata: Metadata = { title: "Minhas cotações · ListaCerta" };

export default async function CotacoesPage({ searchParams }: PageProps<"/cotacao">) {
  const sp = await searchParams;
  const erro = Array.isArray(sp.erro) ? sp.erro[0] : sp.erro;
  await requireAccess("/cotacao");
  const actor = await getSessionActor();
  const rows = actor ? await listMyLeads(actor) : [];
  return (
    <Screen>
      <BackHeader href="/" title="Minhas cotações" />
      <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.035em]">
        {rows.length === 0 ? "Nenhuma cotação ainda" : `${rows.length} ${rows.length === 1 ? "pedido de cotação" : "pedidos de cotação"}`}
      </h1>
      {erro ? <p role="alert" className="bg-[#fde2e0] text-[#8a1c14] rounded-campo px-4 py-3 text-[14px] font-bold">{errorMessageForCode(erro)}</p> : null}
      <p className="bg-campo text-texto-2 rounded-campo px-4 py-3 text-[13px] font-semibold">
        A compra acontece no WhatsApp. Aqui aparece o andamento; o valor só aparece quando a papelaria o informa.
      </p>
      {rows.length === 0 ? (
        <p className="text-texto-2 text-[15px] font-medium">Monte um carrinho e peça cotação a papelarias perto de você.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Cotações">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/cotacao/${r.code}`} className="bg-branco-tonal flex flex-col gap-1.5 rounded-[24px] p-5" data-testid="quote-row">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[16px] font-extrabold">{r.stationeryName ?? "Papelaria indisponível"}</span>
                  <StatusBadge status={r.status} />
                </div>
                <span className="text-texto-2 text-[13px] font-semibold">
                  {r.code} · {r.schoolName} · {r.gradeLabel}
                </span>
                {r.isDemo ? <DemoSeal /> : null}
                <span className="text-[14px] font-bold">
                  {r.quotedTotalCents !== null
                    ? `Valor informado: ${moneyOrUnavailable(r.quotedTotalCents)}${r.quotedAt ? ` em ${formatWhen(r.quotedAt)}` : ""}`
                    : "Valor: ainda não informado"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
