"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

/** Primeira chamada da API: a chave é sempre um marcador (`lc_test_SUA_CHAVE`), nunca uma chave real. */
export function curlCommand(environment: "test" | "live", origin: string): string {
  return `curl -H "x-listacerta-key: lc_${environment}_SUA_CHAVE" \\\n  "${origin}/v1/schools?uf=MT&limit=5"`;
}

export function CurlSample({ environment, origin }: { environment: "test" | "live"; origin: string }) {
  const [copied, setCopied] = useState(false);
  const cmd = curlCommand(environment, origin);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <pre tabIndex={0} aria-label="Exemplo de chamada com curl" className="bg-tinta text-papel overflow-x-auto rounded-campo p-4 text-[12.5px] leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-certo">
        <code>{cmd}</code>
      </pre>
      <Button
        variant="outline"
        className="w-fit"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(cmd);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        Copiar exemplo
      </Button>
      <p role="status" className="text-texto-3 min-h-5 text-[13px] font-semibold">
        {copied ? "Copiado" : ""}
      </p>
    </div>
  );
}
