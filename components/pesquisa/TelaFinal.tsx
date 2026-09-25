"use client";

import { useState } from "react";

import { BarraAcoes } from "./BarraAcoes";
import { Cabecalho } from "./Cabecalho";
import styles from "./pesquisa.module.css";
import { enviarComRetry } from "./retry";
import { TelaFinalSucesso } from "./TelaFinalSucesso";
import { mascararWhatsApp, whatsAppMascaraCompleta } from "./whatsapp-mascara";

type Props = {
  sessionId: string;
  g?: string;
  /** true: sessão já concluída em visita anterior — pula direto para o agradecimento. */
  jaConcluida?: boolean;
};

const CAMPO =
  "border-linha text-tinta rounded-campo focus-visible:border-verde-fundo focus-visible:ring-verde-fundo/25 h-14 w-full border-[1.5px] bg-white px-4 text-base font-medium shadow-[0_1px_2px_rgba(15,27,45,0.04)] outline-none placeholder:text-texto-3 focus-visible:ring-4";

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
    <section
      aria-live="polite"
      className={`${styles.entrar} mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-1 flex-col gap-5 px-5 pt-3`}
    >
      <Cabecalho />
      <h1 className="text-tinta text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
        Obrigada! Quer receber a lista da sua escola pronta em janeiro?
      </h1>
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pesquisa-nome" className="text-texto-2 text-[13px] font-bold">
            Nome <span className="text-texto-3 font-semibold">(opcional)</span>
          </label>
          <input
            id="pesquisa-nome"
            type="text"
            value={nome}
            maxLength={80}
            autoComplete="given-name"
            onChange={(e) => setNome(e.target.value)}
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pesquisa-whatsapp" className="text-texto-2 text-[13px] font-bold">
            WhatsApp
          </label>
          <input
            id="pesquisa-whatsapp"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={whatsapp}
            onChange={(e) => setWhatsapp(mascararWhatsApp(e.target.value))}
            placeholder="(65) 99999-9999"
            className={CAMPO}
          />
        </div>
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
        <label
          className={`rounded-campo has-focus-visible:outline-verde-fundo flex cursor-pointer items-start gap-3 border-[1.5px] px-4 py-3.5 text-sm leading-relaxed font-semibold transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 ${
            aceite ? "border-verde-fundo bg-white" : "border-linha bg-white"
          }`}
        >
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="accent-verde-fundo mt-0.5 h-5 w-5 shrink-0 outline-none"
          />
          <span className="text-tinta">
            Aceito receber mensagens da ListaCerta pelo WhatsApp sobre a lista escolar. Posso cancelar quando quiser.
          </span>
        </label>
      </div>
      <BarraAcoes
        onPrimario={enviar}
        primarioLabel="Quero receber"
        primarioDesabilitado={!habilitado}
        secundario={
          <button
            type="button"
            onClick={() => setEnviado(true)}
            className="text-texto-2 focus-visible:outline-verde-fundo flex h-11 items-center rounded-full px-4 text-sm font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70"
          >
            Agora não
          </button>
        }
      />
    </section>
  );
}
