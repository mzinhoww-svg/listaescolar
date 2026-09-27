import { publishSchoolPayoutConfigAction } from "@/features/payouts/actions";
import { PIX_KEY_KIND_LABEL, PIX_KEY_KINDS } from "@/features/payouts/ports";

type SchoolOption = { id: string; name: string };

/** Publica (ou zera, com alvo "none") o repasse de uma escola/APM. Chave Pix é sensível: nunca preenchida de volta. */
export function SchoolConfigForm({ schools }: { schools: readonly SchoolOption[] }) {
  return (
    <form action={publishSchoolPayoutConfigAction} className="rounded-card flex flex-col gap-4 bg-white p-6">
      <h2 className="text-[16px] font-extrabold">Repasse por escola/APM</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase sm:col-span-2">
          Escola
          <select name="schoolId" required className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case">
            <option value="">Selecione</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Alvo do repasse
          <select name="target" defaultValue="none" className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case">
            <option value="none">Sem repasse</option>
            <option value="school">Escola</option>
            <option value="apm">APM</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Repasse (% da venda, sai da comissão)
          <input name="payoutPercent" inputMode="decimal" placeholder="2,00" className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Beneficiário
          <input name="beneficiaryName" placeholder="Nome da escola ou da APM" className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Chave Pix
          <input name="pixKey" placeholder="Chave Pix do beneficiário" className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase">
          Tipo da chave
          <select name="pixKeyKind" defaultValue="" className="bg-campo h-11 rounded-campo px-3 text-[14px] font-bold normal-case">
            <option value="">Selecione</option>
            {PIX_KEY_KINDS.map((k) => (
              <option key={k} value={k}>{PIX_KEY_KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-texto-3 text-[12px] font-semibold">
        A chave Pix nunca aparece de novo nesta tela depois de salva (dado sensível); para trocar, publique de novo.
      </p>
      <button type="submit" className="bg-tinta text-papel rounded-botao h-11 w-fit px-5 text-[14px] font-extrabold">
        Salvar repasse da escola
      </button>
    </form>
  );
}
