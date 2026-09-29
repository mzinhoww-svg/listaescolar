import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitForTests, checkRateLimit, MAX_TRACKED_KEYS, trackedKeyCount } from "@/lib/rate-limit/memory-bucket";

beforeEach(__resetRateLimitForTests);

describe("checkRateLimit", () => {
  it("permite até o limite e recusa depois, dentro da mesma janela", () => {
    const t = 0;
    for (let i = 0; i < 5; i++) expect(checkRateLimit("k1", 5, 1000, t)).toBe(true);
    expect(checkRateLimit("k1", 5, 1000, t)).toBe(false);
  });

  it("janela nova reseta a contagem", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k1", 5, 1000, 0);
    expect(checkRateLimit("k1", 5, 1000, 0)).toBe(false);
    expect(checkRateLimit("k1", 5, 1000, 1001)).toBe(true);
  });

  it("chaves diferentes têm baldes independentes", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 1000, 0);
    expect(checkRateLimit("a", 5, 1000, 0)).toBe(false);
    expect(checkRateLimit("b", 5, 1000, 0)).toBe(true);
  });

  it("no teto de chaves rastreadas, despeja só a mais antiga (nunca clear() global — revisão de segurança, Menor)", () => {
    // Enche o mapa até o teto, cada chave já no limite de 1 (sem janela expirar: mesmo `now`).
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) checkRateLimit(`k${i}`, 1, 1_000_000, 0);
    // A chave mais antiga (k0) ainda está barrada (sobreviveria com clear(), que reabriria a cota de todo mundo).
    // Uma chave NOVA força o despejo de só uma entrada antiga para abrir vaga.
    expect(checkRateLimit("nova-chave", 1, 1_000_000, 0)).toBe(true);
    // A imensa maioria das chaves antigas continua barrada (só uma foi despejada) — prova que não foi um clear().
    let stillBlocked = 0;
    for (let i = 1; i < MAX_TRACKED_KEYS; i++) if (checkRateLimit(`k${i}`, 1, 1_000_000, 0) === false) stillBlocked++;
    expect(stillBlocked).toBeGreaterThan(MAX_TRACKED_KEYS - 10);
  });

  it("chaves de um namespace nunca expulsam as de outro (revisão S19, I5: widget não reseta login/lead/envio)", () => {
    // login e envio no limite, na mesma janela.
    checkRateLimit("login:1.2.3.4", 1, 1_000_000, 0);
    checkRateLimit("submit:1.2.3.4:u1", 1, 1_000_000, 0);
    checkRateLimit("lead:1.2.3.4:u1", 1, 1_000_000, 0);
    // atacante varia `partnerId` do widget muito além do teto.
    for (let i = 0; i < MAX_TRACKED_KEYS * 2; i++) checkRateLimit(`widget:9.9.9.9:p${i}`, 30, 1_000_000, 0);
    expect(checkRateLimit("login:1.2.3.4", 1, 1_000_000, 0)).toBe(false);
    expect(checkRateLimit("submit:1.2.3.4:u1", 1, 1_000_000, 0)).toBe(false);
    expect(checkRateLimit("lead:1.2.3.4:u1", 1, 1_000_000, 0)).toBe(false);
  });

  it("cada namespace tem o próprio teto de chaves rastreadas", () => {
    expect(trackedKeyCount("widget")).toBe(0);
    for (let i = 0; i < MAX_TRACKED_KEYS + 50; i++) checkRateLimit(`widget:ip:p${i}`, 30, 1_000_000, 0);
    expect(trackedKeyCount("widget")).toBe(MAX_TRACKED_KEYS);
    expect(trackedKeyCount("login")).toBe(0);
  });
});
