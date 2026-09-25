import Link from "next/link";

/** Sino com a contagem de não lidas (o número vem do banco, calculado no servidor). Sem contagem quando zero. */
export function NotificationBell({ count }: { count: number }) {
  return (
    <Link href="/conta/notificacoes" aria-label={`Notificações, ${count} não lidas`} className="bg-campo relative inline-grid size-11 place-items-center rounded-full focus-visible:ring-2">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {count > 0 ? <span className="bg-verde-fundo text-papel absolute -top-1 -right-1 min-w-5 rounded-full px-1 text-center text-[11px] font-extrabold">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}
