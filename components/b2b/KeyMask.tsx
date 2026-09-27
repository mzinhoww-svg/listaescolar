// Exibição mascarada da chave (Global Constraints: `lc_live_••••••••••••7f2a`). Nunca recebe o segredo — só
// ambiente e `last4`, os únicos dados de chave existente que o banco guarda fora do hash.

export function KeyMask({ environment, last4 }: { environment: "test" | "live"; last4: string }) {
  return <code className="text-[13px] font-bold tracking-tight">lc_{environment}_••••••••••••{last4}</code>;
}
