import type { B2bScope } from "@/features/b2b/scopes";

// Chips de escopo (B2B02, Admin15). Rótulo em pt-BR de cada escopo real do contrato (`features/b2b/scopes.ts`).

export const SCOPE_LABEL: Readonly<Record<B2bScope, string>> = {
  "schools:read": "Escolas (leitura)",
  "lists:read": "Listas (leitura)",
  "carts:match": "Casamento de SKUs",
};

export function ScopeChips({ scopes }: { scopes: readonly string[] }) {
  if (scopes.length === 0) return <span className="text-texto-3 text-[12px] font-semibold">Nenhum escopo.</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {scopes.map((s) => (
        <span key={s} className="bg-campo text-texto-2 rounded-botao px-2.5 py-1 text-[11px] font-extrabold">
          {SCOPE_LABEL[s as B2bScope] ?? s}
        </span>
      ))}
    </div>
  );
}
