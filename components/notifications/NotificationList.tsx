import Link from "next/link";

import type { NotificationRow } from "@/features/notifications/queries-types";

import { NotificationItem } from "./NotificationItem";

type Act = (formData: FormData) => Promise<void>;
const HREF = "/conta/notificacoes";
const nav = "border-tinta text-tinta rounded-botao inline-flex min-h-11 items-center border-[1.5px] px-4 text-[13px] font-extrabold";

export function NotificationList({ items, unread, page, pageCount, markRead, markAllRead }: {
  items: NotificationRow[];
  unread: number;
  page: number;
  pageCount: number;
  markRead: Act;
  markAllRead: () => Promise<void>;
}) {
  if (items.length === 0) return <p className="bg-campo rounded-campo px-4 py-6 text-center text-[14px] font-semibold">Nenhuma notificação por enquanto.</p>;
  return (
    <section aria-label="Notificações" className="flex flex-col gap-3">
      {unread > 0 ? (
        <form action={markAllRead}>
          <button type="submit" className="bg-tinta text-papel rounded-botao min-h-11 px-5 text-[13px] font-extrabold">Marcar todas como lidas</button>
        </form>
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.map((n) => (
          <NotificationItem key={n.id} n={n} markRead={markRead} />
        ))}
      </ul>
      {pageCount > 1 ? (
        <nav aria-label="Paginação" className="flex justify-between gap-3">
          {page > 1 ? <Link href={`${HREF}?pagina=${page - 1}`} className={nav}>Anterior</Link> : <span />}
          {page < pageCount ? <Link href={`${HREF}?pagina=${page + 1}`} className={nav}>Próxima</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
