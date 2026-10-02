"use client";

import { useRef, useState } from "react";

import { createKeyAction } from "@/features/b2b/actions";
import type { GeneratedApiKey } from "@/features/b2b/keys/format";
import { MAX_USABLE_KEYS_PER_ENVIRONMENT } from "@/features/b2b/limits";
import { ALLOWED_SCOPES, scopesForPartnerType, type B2bPartnerType, type B2bScope } from "@/features/b2b/scopes";
import { environmentAllowed, type ApiKeyEnvironment, type B2bPartnerStatus } from "@/features/b2b/states";

import { SCOPE_LABEL } from "@/components/b2b/ScopeChips";

// "Nova chave" (B2B02). O texto claro SÓ existe no estado deste componente, entre a criação e o fechamento do
// diálogo (ou a navegação): nunca em `localStorage`, URL ou estado que sobreviva a um recarregamento. `KeyMask`
// não é usado aqui de propósito — o texto claro completo é o ponto do diálogo, uma vez.

type Props = {
  partnerType: B2bPartnerType;
  partnerStatus: B2bPartnerStatus;
  usableCountByEnv: Readonly<Record<ApiKeyEnvironment, number>>;
};

const ENV_LABEL: Record<ApiKeyEnvironment, string> = { test: "Sandbox", live: "Produção" };

export function NewKeyDialog({ partnerType, partnerStatus, usableCountByEnv }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [environment, setEnvironment] = useState<ApiKeyEnvironment>(environmentAllowed("test", partnerStatus) ? "test" : "live");
  const allowedScopes = scopesForPartnerType(partnerType);
  const [scopes, setScopes] = useState<B2bScope[]>([...allowedScopes]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const environments = (["test", "live"] as const).filter((e) => environmentAllowed(e, partnerStatus));
  const tooMany = (usableCountByEnv[environment] ?? 0) >= MAX_USABLE_KEYS_PER_ENVIRONMENT;

  function reset() {
    setResult(null);
    setError(null);
    setCopied(false);
  }
  function close() {
    reset();
    ref.current?.close();
  }
  function toggleScope(s: B2bScope) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function submit() {
    setPending(true);
    setError(null);
    const r = await createKeyAction({ environment, scopes });
    setPending(false);
    if (r.ok) setResult(r.data);
    else setError(r.message);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          ref.current?.showModal();
        }}
        disabled={environments.length === 0}
        className="bg-tinta text-papel rounded-botao flex h-11 items-center px-5 text-[14px] font-extrabold disabled:opacity-50"
      >
        Nova chave
      </button>
      <dialog ref={ref} onClose={close} className="m-auto rounded-[20px] bg-white p-0 backdrop:bg-black/40">
        <div className="flex w-[min(92vw,480px)] flex-col gap-4 p-6">
          {result ? (
            <>
              <h2 className="text-[18px] font-extrabold">Copie agora: esta chave não será mostrada de novo.</h2>
              <code className="bg-tinta text-papel rounded-campo block overflow-x-auto p-3 text-[13px] font-bold">{result.plaintext}</code>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.plaintext);
                    setCopied(true);
                  }}
                  className="border-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-[14px] font-extrabold"
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>
                <button type="button" onClick={close} className="bg-tinta text-papel rounded-botao flex h-11 flex-1 items-center justify-center text-[14px] font-extrabold">
                  Já copiei
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-[18px] font-extrabold">Nova chave</h2>
              {error ? <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-3 py-2.5 text-[13px] font-bold">{error}</p> : null}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[13px] font-bold">Ambiente</legend>
                <div className="flex gap-2">
                  {environments.map((e) => (
                    <label key={e} className={`rounded-botao border-tinta flex-1 border-[1.5px] px-3 py-2 text-center text-[13px] font-bold ${environment === e ? "bg-verde-certo" : ""}`}>
                      <input type="radio" name="environment" className="sr-only" checked={environment === e} onChange={() => setEnvironment(e)} />
                      {ENV_LABEL[e]}
                    </label>
                  ))}
                </div>
                {tooMany ? <p className="text-texto-3 text-[12px] font-semibold">Já há duas chaves utilizáveis neste ambiente. Revogue uma antes.</p> : null}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[13px] font-bold">Escopos</legend>
                {ALLOWED_SCOPES.filter((s) => allowedScopes.includes(s)).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-[13px] font-semibold">
                    <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                    {SCOPE_LABEL[s]}
                  </label>
                ))}
              </fieldset>
              <div className="flex gap-2">
                <button type="button" onClick={close} className="border-tinta rounded-botao flex h-11 flex-1 items-center justify-center border-[1.5px] text-[14px] font-extrabold">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || tooMany || scopes.length === 0}
                  className="bg-tinta text-papel rounded-botao flex h-11 flex-1 items-center justify-center text-[14px] font-extrabold disabled:opacity-50"
                >
                  {pending ? "Criando..." : "Criar chave"}
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
