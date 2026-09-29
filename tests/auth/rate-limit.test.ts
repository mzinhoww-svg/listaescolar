import { beforeEach, describe, expect, it } from "vitest";

import { __resetRateLimitForTests } from "@/lib/rate-limit/memory-bucket";
import { loginRateLimited } from "@/features/auth/rate-limit";

beforeEach(__resetRateLimitForTests);

const ip = (v: string) => new Headers({ "x-real-ip": v });

describe("loginRateLimited (revisão S19, M4)", () => {
  it("permite até 5 tentativas por IP + e-mail e recusa depois", () => {
    const h = ip("1.2.3.4");
    for (let i = 0; i < 5; i++) expect(loginRateLimited(h, "a@b.co")).toBe(false);
    expect(loginRateLimited(h, "a@b.co")).toBe(true);
  });
  it("o e-mail é normalizado (caixa e espaços) antes de compor a chave", () => {
    const h = ip("1.2.3.4");
    for (let i = 0; i < 5; i++) loginRateLimited(h, "a@b.co");
    expect(loginRateLimited(h, "  A@B.co ")).toBe(true);
  });
  it("e-mails diferentes atrás do mesmo IP (NAT de operadora) não se bloqueiam entre si", () => {
    const h = ip("1.2.3.4");
    for (let i = 0; i < 5; i++) expect(loginRateLimited(h, "a@b.co")).toBe(false);
    expect(loginRateLimited(h, "a@b.co")).toBe(true);
    for (let i = 0; i < 5; i++) expect(loginRateLimited(h, `outro${i}@b.co`)).toBe(false);
  });
  it("mas há um teto por IP mais alto (30) contra quem varia e-mails", () => {
    const h = ip("1.2.3.4");
    for (let i = 0; i < 30; i++) expect(loginRateLimited(h, `u${i}@b.co`)).toBe(false);
    expect(loginRateLimited(h, "u31@b.co")).toBe(true);
  });
  it("IPs diferentes têm baldes independentes", () => {
    for (let i = 0; i < 5; i++) loginRateLimited(ip("1.1.1.1"), "a@b.co");
    expect(loginRateLimited(ip("1.1.1.1"), "a@b.co")).toBe(true);
    expect(loginRateLimited(ip("2.2.2.2"), "a@b.co")).toBe(false);
  });
  it("sem IP identificável não vira um balde global: limita por e-mail e com teto de IP próprio, bem mais alto", () => {
    const h = new Headers();
    for (let i = 0; i < 5; i++) expect(loginRateLimited(h, "a@b.co")).toBe(false);
    expect(loginRateLimited(h, "a@b.co")).toBe(true);
    // outro e-mail sem IP segue livre (não herda o balde do primeiro)
    expect(loginRateLimited(h, "c@d.co")).toBe(false);
    // e o teto agregado "sem IP" é bem maior que o de um IP real
    __resetRateLimitForTests();
    for (let i = 0; i < 100; i++) expect(loginRateLimited(h, `u${i}@b.co`)).toBe(false);
  });
});
