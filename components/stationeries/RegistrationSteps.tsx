import type { Municipality } from "@/features/stationeries/queries";
import { PAYMENT_METHODS } from "@/features/stationeries/schemas";

import { Field, inputClass } from "./fields";

type Errors = Record<string, string>;
type Values = Record<string, string | string[]>;

const val = (v: Values, k: string): string => {
  const x = v[k];
  return typeof x === "string" ? x : "";
};
const list = (v: Values, k: string): string[] => {
  const x = v[k];
  return Array.isArray(x) ? x : [];
};

const PAYMENT_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Débito",
  cash: "Dinheiro",
  boleto: "Boleto",
};

export function StepBasics({ values, errors, municipalities }: { values: Values; errors: Errors; municipalities: Municipality[] }) {
  const f = (id: string, label: string, opts: { hint?: string; inputMode?: "numeric" | "text"; autoComplete?: string } = {}) => (
    <Field id={id} label={label} error={errors[id]} {...(opts.hint ? { hint: opts.hint } : {})}>
      <input
        id={id}
        name={id}
        defaultValue={val(values, id)}
        inputMode={opts.inputMode}
        autoComplete={opts.autoComplete ?? "off"}
        aria-invalid={errors[id] !== undefined}
        aria-describedby={errors[id] ? `${id}-erro` : undefined}
        className={inputClass}
      />
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {f("tradeName", "Nome fantasia")}
      {f("legalName", "Razão social")}
      {f("cnpj", "CNPJ", { hint: "Só confere o formato: o cadastro passa por análise da equipe.", inputMode: "numeric" })}
      <Field id="municipalityId" label="Município" error={errors.municipalityId}>
        <select
          key={val(values, "municipalityId")} // React não reaplica o defaultValue de <select> depois do reset do formulário
          id="municipalityId"
          name="municipalityId"
          defaultValue={val(values, "municipalityId")}
          aria-invalid={errors.municipalityId !== undefined}
          className={inputClass}
        >
          <option value="">Selecione</option>
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}/{m.uf}
            </option>
          ))}
        </select>
      </Field>
      {f("neighborhood", "Bairro da loja")}
      {f("address", "Endereço (opcional)", { autoComplete: "street-address" })}
      {f("cep", "CEP (opcional)", { inputMode: "numeric" })}
    </div>
  );
}

export function StepConsent({ errors, values }: { errors: Errors; values: Values }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-texto-2 text-[15px]">
        Depois de enviar, a equipe analisa o cadastro. Cadastro não é verificação: você só aparece para os pais depois da aprovação e
        de publicar sua papelaria.
      </p>
      <label className="flex items-start gap-3 text-[14px] font-bold">
        <input
          type="checkbox"
          name="lgpdAccepted"
          defaultChecked={val(values, "lgpdAccepted") === "on"}
          aria-invalid={errors.lgpdAccepted !== undefined}
          className="accent-verde-fundo mt-0.5 size-5 shrink-0"
        />
        Uso os dados do responsável só para atender o pedido da lista (LGPD).
      </label>
      {errors.lgpdAccepted ? (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {errors.lgpdAccepted}
        </p>
      ) : null}
    </div>
  );
}

export { list, val, PAYMENT_LABEL };
