/** Navegadores embutidos (WebView de apps) onde o link do e-mail abre em outro contexto e o login por link falha. */
export type InAppBrowser = "whatsapp" | "instagram" | "facebook";

const PATTERNS: ReadonlyArray<readonly [InAppBrowser, RegExp]> = [
  ["whatsapp", /WhatsApp/i],
  ["instagram", /Instagram/i],
  ["facebook", /FBAN|FBAV|FB_IAB|FB4A|FBIOS/i],
];

export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser | null {
  if (!userAgent) return null;
  return PATTERNS.find(([, re]) => re.test(userAgent))?.[0] ?? null;
}

/** Intent do Android que abre a URL no Chrome. No iOS não existe equivalente: a saída é copiar o link. */
export function chromeIntentUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const scheme = u.protocol.slice(0, -1);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}
