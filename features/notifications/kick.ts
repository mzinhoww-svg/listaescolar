/** "Kick" best effort depois de um fato que gera notificação: pede o despacho sem esperar. Sem segredo ou origem, não faz nada; nunca lança. */
export async function kickDispatch(env: Record<string, string | undefined> = process.env): Promise<void> {
  const secret = (env.NOTIFICATIONS_DISPATCH_SECRET ?? "").trim();
  const origin = (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (secret.length < 16 || !/^https?:\/\//.test(origin)) return;
  try {
    await fetch(`${origin}/api/notifications/dispatch`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(2000) });
  } catch {
    // o cron diário (e o pg_cron, quando existir) cobre
  }
}
