"use client";

import { useState } from "react";

import { PAYMENT_METHODS } from "@/features/stationeries/schemas";
import { WHATSAPP_TEST_MESSAGE, whatsappLink } from "@/features/stationeries/whatsapp";

import { Chip, Field, inputClass } from "./fields";
import { PAYMENT_LABEL, list, val } from "./RegistrationSteps";

type Props = { values: Record<string, string | string[]>; errors: Record<string, string> };

export function StepService({ values, errors }: Props) {
  const [whatsapp, setWhatsapp] = useState(val(values, "whatsapp"));
  const [radius, setRadius] = useState(Number(val(values, "serviceRadiusKm") || "0"));
  const [areas, setAreas] = useState<string[]>(list(values, "areas"));
  const [draft, setDraft] = useState("");
  const test = whatsappLink(whatsapp, WHATSAPP_TEST_MESSAGE);
  const paymentDefault = new Set(list(values, "paymentMethods"));

  const addArea = () => {
    const name = draft.trim().replace(/\s+/g, " ");
    if (name.length >= 2 && !areas.some((a) => a.toLowerCase() === name.toLowerCase())) setAreas([...areas, name]);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="whatsapp" label="WhatsApp de atendimento" error={errors.whatsapp} hint="Você pode abrir uma conversa de teste para conferir o número.">
          <input
            id="whatsapp"
            name="whatsapp"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(65) 90000-0000"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            aria-invalid={errors.whatsapp !== undefined}
            className={inputClass}
          />
          {test ? (
            <a href={test} target="_blank" rel="noreferrer" className="text-verde-fundo w-fit text-[13px] font-extrabold underline">
              Testar no WhatsApp (só abre a conversa; nada é enviado)
            </a>
          ) : (
            <span className="text-texto-3 text-[12px] font-semibold">Informe um número válido para habilitar o teste.</span>
          )}
        </Field>
        <Field id="openingHours" label="Horário" error={errors.openingHours}>
          <input id="openingHours" name="openingHours" defaultValue={val(values, "openingHours")} placeholder="Seg a sáb · 08h às 18h" className={inputClass} />
        </Field>
        <Field id="phone" label="Telefone (opcional)" error={errors.phone}>
          <input id="phone" name="phone" inputMode="tel" defaultValue={val(values, "phone")} className={inputClass} />
        </Field>
        <Field id="email" label="E-mail de contato (opcional)" error={errors.email}>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={val(values, "email")} className={inputClass} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-[14px] font-extrabold">Bairros atendidos</legend>
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => (
            <span key={a} className="bg-verde-certo ring-tinta inline-flex items-center gap-2 rounded-botao px-4 py-2.5 text-[14px] font-extrabold ring-[1.5px]">
              {a}
              <input type="hidden" name="areas" value={a} />
              <button type="button" aria-label={`Remover ${a}`} onClick={() => setAreas(areas.filter((x) => x !== a))} className="font-black">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            aria-label="Novo bairro"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addArea();
              }
            }}
            placeholder="Nome do bairro"
            className={inputClass}
          />
          <button type="button" onClick={addArea} className="bg-campo shrink-0 rounded-botao px-5 text-[14px] font-extrabold">
            + Adicionar
          </button>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="serviceRadiusKm" className="flex justify-between text-[14px] font-extrabold">
          <span>Raio de entrega</span>
          <span>{radius} km</span>
        </label>
        <input
          id="serviceRadiusKm"
          name="serviceRadiusKm"
          type="range"
          min={0}
          max={50}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="accent-tinta w-full"
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-[14px] font-extrabold">Formas de pagamento</legend>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} name="paymentMethods" value={m} label={PAYMENT_LABEL[m]} defaultChecked={paymentDefault.has(m)} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[14px] font-extrabold">Como você entrega</legend>
        <div className="flex flex-wrap gap-2">
          <Chip name="offersDelivery" label="Entrega no bairro" defaultChecked={val(values, "offersDelivery") === "on"} />
          <Chip name="offersPickup" label="Retirada na loja" defaultChecked={val(values, "offersPickup") === "on"} />
        </div>
        {errors.offersPickup ? (
          <p role="alert" className="mt-2 text-[13px] font-semibold text-red-700">
            {errors.offersPickup}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
