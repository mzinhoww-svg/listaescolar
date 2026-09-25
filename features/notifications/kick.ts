/**
 * "Kick" best effort depois de um fato que gera notificação: pede o despacho sem esperar. O Bearer só vai para a origem configurada
 * e válida (https, ou http de loopback), sem credencial nem caminho, e nunca segue redirect. Nunca lança.
 */
import "server-only";

export function validKickOrigin(raw: string | undefined): string | null {
  let u: URL;
  try {
    u = new URL((raw ?? "").trim());
  } catch {
    return null;
  }
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  if (!(u.protocol === "https:" || (u.protocol === "http:" && loopback))) return null;
  if (u.username || u.password || u.search || u.hash || u.pathname !== "/") return null;
  return u.origin;
}

export async function kickDispatch(env: Record<string, string | undefined> = process.env): Promise<void> {
  const secret = (env.NOTIFICATIONS_DISPATCH_SECRET ?? "").trim();
  const origin = validKickOrigin(env.NEXT_PUBLIC_SITE_URL);
  if (secret.length < 16 || !origin) return;
  try {
    await fetch(`${origin}/api/notifications/dispatch`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, redirect: "manual", signal: AbortSignal.timeout(2000) });
  } catch {
    // o cron diário (e o pg_cron, quando existir) cobre
  }
}
