import { describe, expect, it } from "vitest";

import { baseSecurityHeaders, buildCsp, cspOriginsFromEnv, securityHeaders } from "@/lib/security-headers";

describe("buildCsp", () => {
  it("inclui o nonce em script-src e nunca 'unsafe-inline' em script-src", () => {
    const csp = buildCsp("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).not.toContain("unsafe-inline");
  });
  it("frame-ancestors 'self' (nenhum iframe de terceiro embute o site)", () => {
    expect(buildCsp("x")).toContain("frame-ancestors 'self'");
  });
  it("object-src 'none' e base-uri 'self'", () => {
    const csp = buildCsp("x");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});

describe("buildCsp: origens externas (revisão S19, I3)", () => {
  const opts = {
    supabaseUrl: "https://abc.supabase.co",
    sentryDsn: "https://pubkey@o123.ingest.sentry.io/456",
  };
  const directive = (csp: string, name: string) =>
    csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";

  it("libera a origem do Supabase em img-src, frame-src e connect-src (https e wss)", () => {
    const csp = buildCsp("n", opts);
    expect(directive(csp, "img-src")).toContain("https://abc.supabase.co");
    expect(directive(csp, "frame-src")).toContain("https://abc.supabase.co");
    expect(directive(csp, "connect-src")).toContain("https://abc.supabase.co");
    expect(directive(csp, "connect-src")).toContain("wss://abc.supabase.co");
  });
  it("libera a origem do DSN do Sentry só em connect-src", () => {
    const csp = buildCsp("n", opts);
    expect(directive(csp, "connect-src")).toContain("https://o123.ingest.sentry.io");
    expect(directive(csp, "img-src")).not.toContain("sentry.io");
  });
  it("sem origens configuradas, nada além de 'self'", () => {
    const csp = buildCsp("n");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "frame-src")).toBe("frame-src 'self'");
  });
  it("ignora URL inválida em vez de lançar", () => {
    expect(() => buildCsp("n", { supabaseUrl: "não é url", sentryDsn: "x" })).not.toThrow();
  });
  it("cspOriginsFromEnv lê NEXT_PUBLIC_SUPABASE_URL e SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN", () => {
    expect(
      cspOriginsFromEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SENTRY_DSN: "https://k@o1.ingest.sentry.io/2" }),
    ).toMatchObject({ supabaseUrl: "http://127.0.0.1:54321", sentryDsn: "https://k@o1.ingest.sentry.io/2", isDev: false });
    expect(cspOriginsFromEnv({ NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/2" }).sentryDsn).toBeDefined();
  });
});

describe("baseSecurityHeaders", () => {
  it("HSTS sem preload (revisão S19, M3: decisão de go-live da S20)", () => {
    expect(baseSecurityHeaders()["Strict-Transport-Security"]).not.toContain("preload");
  });
  it("cobre HSTS, nosniff, Referrer-Policy, Permissions-Policy e COOP", () => {
    const h = baseSecurityHeaders();
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });
});

describe("securityHeaders", () => {
  it("junta os cabeçalhos base com o CSP desta requisição", () => {
    const h = securityHeaders("nonceX");
    expect(h["Content-Security-Policy"]).toContain("nonce-nonceX");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("staticAssetHeaders (revisão S19, M2)", () => {
  it("/brand/:path* (fora do matcher do proxy) recebe nosniff, base e CSP restritiva de SVG", async () => {
    const { staticAssetHeaders } = await import("@/lib/security-headers");
    const entries = staticAssetHeaders();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.source).toBe("/brand/:path*");
    const map = Object.fromEntries((entries[0]?.headers ?? []).map((h) => [h.key, h.value]));
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Content-Security-Policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(map["Strict-Transport-Security"]).not.toContain("preload");
  });
});
