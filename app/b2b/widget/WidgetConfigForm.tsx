"use client";

import { useState } from "react";

import { saveWidgetConfigAction } from "@/features/widget/actions";

// Configuração do widget (B2B04): cor de destaque, domínio do carrinho (hostname puro; o servidor recusa
// esquema/caminho/porta — anti open-redirect) e liga/desliga. Sem região editável aqui: a cobertura vem do
// cadastro do parceiro (Admin15), só exibida como leitura.

type Props = { partnerId: string; coverageLabel: string; initial: { accentColor: string; cartTargetDomain: string; enabled: boolean } | null; siteOrigin: string };

export function WidgetConfigForm({ partnerId, coverageLabel, initial, siteOrigin }: Props) {
  const [accentColor, setAccentColor] = useState(initial?.accentColor ?? "#0B6B4A");
  const [cartTargetDomain, setCartTargetDomain] = useState(initial?.cartTargetDomain ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const snippet = `<script src="${siteOrigin}/widget.js"\n    data-partner-id="${partnerId}"\n    data-region="${coverageLabel}"></script>\n<div id="listacerta-widget"></div>`;

  async function submit() {
    setPending(true);
    setError(null);
    setSaved(false);
    const r = await saveWidgetConfigAction({ accentColor, cartTargetDomain, enabled });
    setPending(false);
    if (r.ok) setSaved(true);
    else setError(r.message);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5">
        <h2 className="text-[16px] font-extrabold">Configuração</h2>
        {error ? (
          <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-3 py-2.5 text-[13px] font-bold">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="bg-verde-certo text-tinta rounded-campo px-3 py-2.5 text-[13px] font-bold">
            Configuração salva.
          </p>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold">Cor de destaque</span>
          <div className="flex items-center gap-2">
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-11 w-14 rounded-botao border-0" aria-label="Cor de destaque" />
            <input
              type="text"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="#0B6B4A"
              className="border-linha rounded-campo h-11 flex-1 border-[1.5px] px-3 text-[14px] font-semibold"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold">Ao finalizar, enviar para</span>
          <input
            type="text"
            value={cartTargetDomain}
            onChange={(e) => setCartTargetDomain(e.target.value)}
            placeholder="carrinho.suaempresa.com.br"
            className="border-linha rounded-campo h-11 border-[1.5px] px-3 text-[14px] font-semibold"
          />
          <span className="text-texto-3 text-[12px] font-semibold">Só o domínio (sem https:// nem caminho). O widget sempre monta a URL do carrinho a partir deste domínio.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold">Região</span>
          <input type="text" value={coverageLabel} disabled className="border-linha bg-campo rounded-campo h-11 border-[1.5px] px-3 text-[14px] font-semibold" />
        </label>

        <label className="flex items-center gap-2 text-[13px] font-bold">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Widget ligado (embutível pelo seu site)
        </label>

        <button type="button" onClick={submit} disabled={pending || cartTargetDomain.length === 0} className="bg-tinta text-papel rounded-botao flex h-11 items-center justify-center text-[14px] font-extrabold disabled:opacity-50">
          {pending ? "Salvando..." : "Salvar"}
        </button>

        <div className="flex flex-col gap-1.5">
          <p className="text-texto-3 text-[12px] font-extrabold tracking-[0.04em] uppercase">Código de incorporação</p>
          <pre className="bg-tinta text-papel overflow-x-auto rounded-campo p-4 text-[12.5px] leading-relaxed">
            <code>{snippet}</code>
          </pre>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
            }}
            className="border-tinta rounded-botao flex h-10 w-fit items-center justify-center border-[1.5px] px-4 text-[13px] font-extrabold"
          >
            {copied ? "Copiado" : "Copiar código"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold">Pré-visualização</h2>
          <span className="bg-campo text-texto-2 rounded-botao px-3 py-1 text-[12px] font-extrabold">Como aparece no seu site</span>
        </div>
        <div className="rounded-[16px] border-[1.5px] border-dashed border-[#c9c2b3] p-4" style={{ borderColor: accentColor }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[15px] font-extrabold">Lista escolar</p>
            <span className="text-texto-3 text-[11px] font-bold">por listacerta</span>
          </div>
          <div className="border-linha bg-campo mb-3 rounded-campo border-[1.5px] px-3 py-2.5 text-[13px] font-semibold text-[#8a8375]">Nome da escola</div>
          <ul className="mb-3 flex flex-col gap-2">
            {["[Item da lista]", "[Item da lista]", "[Item da lista]"].map((it, i) => (
              <li key={i} className="flex items-center justify-between text-[13px] font-semibold">
                <span>✅ {it}</span>
                <span className="text-texto-3">[qtd]</span>
              </li>
            ))}
          </ul>
          <button type="button" disabled className="w-full rounded-botao px-4 py-2.5 text-[14px] font-extrabold text-white" style={{ backgroundColor: accentColor }}>
            Adicionar tudo ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
}
