// Anti-SSRF do Web Push: o servidor só envia para serviços de push conhecidos (mesma regra do CHECK de push_subscriptions).
// Nada de IP literal, host interno, porta, credencial no URL ou http; loopback http só em local/development (E2E com coletor local).
const HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)+push\.apple\.com$/, /^([a-z0-9-]+\.)+notify\.windows\.com$/];

export function isAllowedPushEndpoint(endpoint: unknown, appEnv: string | undefined): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 2000) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.username || u.password || u.hash) return false;
  if (u.protocol === "http:") {
    return (appEnv === "local" || appEnv === "development") && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  }
  if (u.protocol !== "https:" || u.port !== "") return false;
  const host = u.hostname.toLowerCase();
  return HOSTS.some((re) => re.test(host));
}
