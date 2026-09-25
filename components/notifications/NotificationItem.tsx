import Link from "next/link";

import { renderNotification } from "@/features/notifications/copy";
import { isSafeLinkPath, notificationParamsSchema } from "@/features/notifications/params";
import type { NotificationRow } from "@/features/notifications/queries-types";

const when = (iso: string): string => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" });

/** Uma notificação da central. Texto do catálogo como texto React (nada de HTML); params fora da lista fechada são descartados. */
export function NotificationItem({ n, markRead }: { n: NotificationRow; markRead: (formData: FormData) => Promise<void> }) {
  const params = notificationParamsSchema.safeParse(n.params);
  const { title, body } = renderNotification(n.eventType, params.success ? params.data : {});
  const unread = n.readAt === null;
  return (
    <li className={`flex flex-col gap-1.5 rounded-[20px] p-4 ${unread ? "bg-white" : "bg-campo"}`}>
      <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold">
        {unread ? <span className="bg-verde-fundo text-papel rounded-full px-2.5 py-0.5">Nova</span> : null}
        {n.isDemo ? <span className="bg-aviso-fundo text-aviso-texto rounded-full px-2.5 py-0.5">Demonstração</span> : null}
        <time dateTime={n.createdAt} className="text-texto-3 font-semibold">{when(n.createdAt)}</time>
      </div>
      {isSafeLinkPath(n.linkPath) ? (
        <Link href={n.linkPath} className="text-[15px] leading-[1.3] font-extrabold underline-offset-2 hover:underline focus-visible:ring-2">
          <span>{title}</span>
        </Link>
      ) : (
        <span className="text-[15px] font-extrabold">{title}</span>
      )}
      <p className="text-texto-2 text-[13px] leading-[1.4] font-medium">{body}</p>
      {unread ? (
        <form action={markRead}>
          <input type="hidden" name="id" value={n.id} />
          <button type="submit" className="border-tinta text-tinta rounded-botao min-h-11 border-[1.5px] px-4 text-[13px] font-extrabold">
            Marcar como lida
          </button>
        </form>
      ) : null}
    </li>
  );
}
