"use client";

import { useState } from "react";

import { enviarComRetry } from "./retry";
import { TelaFinalSucesso } from "./TelaFinalSucesso";
import { mascararWhatsApp, whatsAppMascaraCompleta } from "./whatsapp-mascara";

type Props = {
  sessionId: string;
  g?: string;
  /** true: sessão já concluída em visita anterior — pula direto para o agradecimento. */
  jaConcluida?: boolean;
};

/** Tela final: captura opcional de lead (nome + WhatsApp + consentimento) ou o sucesso. */
export function TelaFinal({ sessionId, g, jaConcluida }: Props) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [aceite, setAceite] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(Boolean(jaConcluida));

  const completo = whatsAppMascaraCompleta(whatsapp);
  const habilitado = completo && aceite && !enviando;

  async function enviar() {
    setEnviando(true);
    await enviarComRetry(
      "/api/pesquisa/lead",
      {
        session_id: sessionId,
        name: nome.trim() || undefined,
        whatsapp,
        consent: true,
        hp: honeypot || undefined,
      },
      () => console.error("[pesquisa-lead] falha ao enviar após as tentativas"),
    );
    setEnviando(false);
    setEnviado(true);
  }

  if (enviado) return <TelaFinalSucesso sessionId={sessionId} g={g} />;

  return (
    <section aria-live="polite" className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-5 py-8">
      <h1 className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em]">
        Obrigada! Quer receber a lista da sua escola pronta em janeiro?
      </h1>
      <div className="flex flex-col gap-4">
        <input
          type="text"
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (opcional)"
          aria-label="Nome"
          className="border-linha rounded-campo h-12 w-full border bg-white px-4 text-base"
        />
        <input
          type="tel"
          inputMode="numeric"
          value={whatsapp}
          onChange={(e) => setWhatsapp(mascararWhatsApp(e.target.value))}
          placeholder="(65) 99999-9999"
          aria-label="WhatsApp"
          className="border-linha rounded-campo h-12 w-full border bg-white px-4 text-base"
        />
        {/* honeypot: invisível para pessoas, alvo comum para bots */}
        <input
          type="text"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          name="site"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 0, height: 0, opacity: 0 }}
        />
        <label className="flex items-start gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          Aceito receber mensagens da ListaCerta pelo WhatsApp sobre a lista escolar. Posso cancelar quando quiser.
        </label>
      </div>
      <button
        type="button"
        onClick={enviar}
        disabled={!habilitado}
        className="bg-tinta text-papel rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold disabled:opacity-40"
      >
        Quero receber
      </button>
      <button
        type="button"
        onClick={() => setEnviado(true)}
        className="text-texto-2 self-center text-sm font-bold underline underline-offset-2"
      >
        Agora não
      </button>
    </section>
  );
}
