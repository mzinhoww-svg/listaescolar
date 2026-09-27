import { describe, expect, it } from "vitest";

import { baseSecurityHeaders, buildCsp, securityHeaders } from "@/lib/security-headers";

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

describe("baseSecurityHeaders", () => {
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
