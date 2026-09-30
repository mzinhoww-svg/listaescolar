"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, fieldInputClass } from "@/components/ui/Field";
import { InlineStatus } from "@/components/ui/InlineStatus";
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5">
        <h2 className="text-[16px] font-extrabold">Configuração</h2>
        {error ? <InlineStatus tone="error">{error}</InlineStatus> : null}
        {saved ? <InlineStatus tone="success">Configuração salva.</InlineStatus> : null}

        <Field id="widget-cor" label="Cor de destaque (hexadecimal)" hint="Use o formato #0B6B4A. O seletor ao lado preenche o mesmo valor.">
          <div className="flex items-center gap-2">
            <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : "#0B6B4A"} onChange={(e) => setAccentColor(e.target.value)} className="h-11 w-14 rounded-botao border-0" aria-label="Escolher a cor no seletor" />
            <input id="widget-cor" type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#0B6B4A" className={fieldInputClass} />
          </div>
        </Field>

        <Field id="widget-dominio" label="Ao finalizar, enviar para" hint="Só o domínio (sem https:// nem caminho). O widget sempre monta a URL do carrinho a partir deste domínio.">
          <input id="widget-dominio" type="text" value={cartTargetDomain} onChange={(e) => setCartTargetDomain(e.target.value)} placeholder="carrinho.suaempresa.com.br" className={fieldInputClass} />
        </Field>

        <Field id="widget-regiao" label="Região" hint="Vem do seu cadastro; para mudar, fale com o time.">
          <input id="widget-regiao" type="text" value={coverageLabel} disabled className={fieldInputClass} />
        </Field>

        <label className="flex items-center gap-2 text-[13px] font-bold">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Widget ligado (embutível pelo seu site)
        </label>

        <Button loading={pending} disabled={cartTargetDomain.length === 0} onClick={submit}>
          Salvar
        </Button>
        {cartTargetDomain.length === 0 ? <p className="text-texto-2 text-[13px] font-semibold">Informe o domínio do carrinho para salvar.</p> : null}

        <div className="flex flex-col gap-1.5">
          <p className="text-texto-3 text-[12px] font-extrabold tracking-[0.04em] uppercase">Código de incorporação</p>
          <pre tabIndex={0} aria-label="Código de incorporação" className="bg-tinta text-papel overflow-x-auto rounded-campo p-4 text-[12.5px] leading-relaxed">
            <code>{snippet}</code>
          </pre>
          <Button
            variant="outline"
            className="w-fit"
            disabled={!enabled}
            onClick={async () => {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
            }}
          >
            {copied ? "Copiado" : "Copiar código"}
          </Button>
          {enabled ? null : <p className="text-texto-2 text-[13px] font-semibold">Ligue o widget para copiar o código.</p>}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold">Pré-visualização</h2>
          <span className="bg-campo text-texto-2 rounded-botao px-3 py-1 text-[12px] font-extrabold">Como aparece no seu site</span>
        </div>
        <div className="rounded-[16px] border-[1.5px] border-dashed border-linha-tracejada p-4" style={{ borderColor: accentColor }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[15px] font-extrabold">Lista escolar</p>
            <span className="text-texto-3 text-[12px] font-bold">por ListaCerta</span>
          </div>
          <div className="border-linha bg-campo mb-3 rounded-campo border-[1.5px] px-3 py-2.5 text-[13px] font-semibold text-texto-3">Nome da escola</div>
          <ul className="mb-3 flex flex-col gap-2">
            {["Caderno (exemplo)", "Lápis (exemplo)", "Borracha (exemplo)"].map((it, i) => (
              <li key={i} className="flex items-center justify-between text-[13px] font-semibold">
                <span>{it}</span>
                <span className="text-texto-3">1 un.</span>
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
