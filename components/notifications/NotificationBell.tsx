"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sino com a contagem de não lidas (o número vem do banco, calculado no servidor). Sem contagem quando zero.
 * Dentro da central ele não é link para si mesmo: aponta para a lista de avisos da própria página (`#central`).
 */
export function NotificationBell({ count }: { count: number }) {
  const inCenter = usePathname() === "/conta/notificacoes";
  return (
    <Link
      href={inCenter ? "#central" : "/conta/notificacoes"}
      aria-current={inCenter ? "page" : undefined}
      aria-label={`Notificações, ${count} não lidas`}
      className="bg-campo focus-visible:outline-verde-fundo relative inline-grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {count > 0 ? <span className="bg-verde-fundo text-papel absolute -top-1 -right-1 min-w-5 rounded-full px-1 text-center text-[12px] font-extrabold">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}
