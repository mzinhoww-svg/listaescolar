import Link from "next/link";

import { PartnerStatusBadge } from "@/components/b2b/StatusBadge";
import { getSessionActor } from "@/features/auth/actor";
import { getMyPartnerHeader, getMyPartnerOverview } from "@/features/b2b/queries";
import type { B2bPartnerStatus } from "@/features/b2b/states";
import { B2B_TERMS_TEXT_VERSION } from "@/features/b2b/terms";

// `/b2b/conta`: dados do cadastro, status e termos aceitos (brief). Só leitura nesta fatia — editar cadastro não
// está no PLAN da S24 (dívida).

export const metadata = { title: "Conta · Portal B2B · ListaCerta" };

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-texto-3 text-[12px] font-extrabold tracking-[0.06em] uppercase">{k}</dt>
      <dd className="font-bold break-words">{v}</dd>
    </div>
  );
}

const PARTNER_TYPE_LABEL: Record<string, string> = { retailer: "Varejista", brand: "Marca", edtech: "EdTech" };

export default async function Page() {
  const actor = await getSessionActor();
  const [overview, header] = actor ? await Promise.all([getMyPartnerOverview(actor), getMyPartnerHeader(actor)]) : [null, null];
  if (!overview || !header) return <p className="text-texto-2 text-[15px] font-bold">Não foi possível carregar os dados da conta agora.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Conta</h1>
        <PartnerStatusBadge status={overview.status as B2bPartnerStatus} />
      </div>
      <section className="rounded-[24px] bg-white p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Row k="Empresa" v={header.tradeName} />
          <Row k="Razão social" v={header.legalName} />
          <Row k="CNPJ" v={header.cnpj} />
          <Row k="Tipo de parceria" v={PARTNER_TYPE_LABEL[header.partnerType] ?? header.partnerType} />
          <Row k="Contato" v={header.contactName} />
          <Row k="Região de interesse" v={header.coverageUfs ? header.coverageUfs.join(", ") : "Nacional"} />
        </dl>
        {header.statusReason ? (
          <p className="bg-campo rounded-campo mt-4 px-4 py-3 text-[14px] font-semibold">Motivo registrado: {header.statusReason}</p>
        ) : null}
      </section>
      <section className="rounded-[24px] bg-white p-6">
        <h2 className="text-[16px] font-extrabold">Termos da API</h2>
        <p className="text-texto-2 mt-1 text-[14px] font-semibold">
          Aceitos no cadastro · versão {B2B_TERMS_TEXT_VERSION}.{" "}
          <Link href="/parceiros/termos" className="underline" target="_blank" rel="noreferrer">
            Ver termos
          </Link>
        </p>
      </section>
    </div>
  );
}
