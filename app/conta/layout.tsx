import { NotificationBell } from "@/components/notifications/NotificationBell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { unreadCount } from "@/features/notifications/queries";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAccess("/conta");
  const actor = await getSessionActor();
  const count = actor ? await unreadCount(actor).catch(() => 0) : 0;
  return (
    <>
      <div className="mx-auto flex w-full max-w-[420px] justify-end px-6 pt-4">
        <NotificationBell count={count} />
      </div>
      {children}
    </>
  );
}
