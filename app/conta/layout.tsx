import Link from "next/link";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SkipLink } from "@/components/site/SkipLink";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { unreadCount } from "@/features/notifications/queries";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAccess("/conta");
  const actor = await getSessionActor();
  const count = actor ? await unreadCount(actor).catch(() => 0) : 0;
  return (
    <>
      <SkipLink />
      <header className="mx-auto flex w-full max-w-[420px] items-center justify-between px-6 pt-4">
        <Link
          href="/"
          aria-label="ListaCerta, ir para o início"
          className="focus-visible:outline-verde-fundo -ml-2 inline-flex min-h-11 min-w-11 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/simbolo.svg" alt="" width={32} height={32} />
        </Link>
        <NotificationBell count={count} />
      </header>
      {children}
    </>
  );
}
