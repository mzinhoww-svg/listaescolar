import Link from "next/link";

import { BRAZIL_UFS } from "@/features/b2b/schemas";

import { applyPartnerAction } from "./actions";

// Formulário de cadastro (B2B00 "Vamos conversar"). Sem "use client": nenhum campo precisa de estado React — o
// tipo de parceria usa rádios com `peer-checked` (CSS) e o aceite dos termos usa `required` nativo do navegador
// (cadastro sem aceite não avança, sem JavaScript). `applyPartnerAction` já faz redirect + `?erro=`/`?ok=`.

const input = "h-12 w-full rounded-campo bg-campo px-4 text-[15px] font-medium text-tinta placeholder:text-texto-3";
const label = "flex flex-col gap-1.5 text-[14px] font-bold";

const PARTNER_TYPES = [
  { value: "retailer", label: "Varejista" },
  { value: "brand", label: "Marca" },
  { value: "edtech", label: "EdTech" },
] as const;

export function ApplyForm({ accountEmail }: { accountEmail: string }) {
  return (
    <form action={applyPartnerAction} className="flex flex-col gap-4 rounded-[24px] bg-white p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Empresa
          <input className={input} name="tradeName" required maxLength={120} placeholder="Nome fantasia" />
        </label>
        <label className={label}>
          Razão social
          <input className={input} name="legalName" required maxLength={200} placeholder="Razão social" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          CNPJ
          <input className={input} name="cnpj" required maxLength={20} placeholder="00.000.000/0001-00" />
        </label>
        <label className={label}>
          Seu nome
          <input className={input} name="contactName" required maxLength={120} placeholder="Nome" />
        </label>
      </div>
      <label className={label}>
        E-mail corporativo
        <input className={`${input} cursor-not-allowed opacity-70`} value={accountEmail} disabled readOnly />
        <span className="text-texto-3 text-[12px] font-semibold">E-mail da conta em que você está autenticado.</span>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[14px] font-bold">Tipo de parceria</legend>
        <div className="flex flex-wrap gap-2">
          {PARTNER_TYPES.map((t, i) => (
            <label key={t.value} className="cursor-pointer">
              <input type="radio" name="partnerType" value={t.value} defaultChecked={i === 0} className="peer sr-only" required />
              <span className="peer-checked:bg-verde-certo peer-focus-visible:outline-tinta rounded-botao border-tinta inline-flex h-10 items-center border-2 bg-transparent px-4 text-[13px] font-bold peer-focus-visible:outline-2">
                {t.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[14px] font-bold">Região de interesse</legend>
        <p className="text-texto-3 text-[12px] font-semibold">Nenhuma UF marcada = cobertura nacional.</p>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
          {BRAZIL_UFS.map((uf) => (
            <label key={uf} className="bg-campo rounded-campo flex h-9 items-center justify-center gap-1 text-[12px] font-bold">
              <input type="checkbox" name="coverageUfs" value={uf} className="size-3.5" />
              {uf}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-2.5 text-[13px] font-semibold">
        <input type="checkbox" name="termsAccepted" required className="mt-0.5 size-4" />
        <span>
          Li e aceito os{" "}
          <Link href="/parceiros/termos" className="underline" target="_blank" rel="noreferrer">
            termos de uso da API
          </Link>
          .
        </span>
      </label>
      <button type="submit" className="bg-tinta text-papel h-12 rounded-botao text-[16px] font-extrabold">
        Enviar
      </button>
    </form>
  );
}
