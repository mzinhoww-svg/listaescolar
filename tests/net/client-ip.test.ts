import { describe, expect, it } from "vitest";

import { clientIp } from "@/lib/net/client-ip";

describe("clientIp", () => {
  it("prioriza x-vercel-forwarded-for", () => {
    const h = new Headers({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2" });
    expect(clientIp(h)).toBe("1.1.1.1");
  });
  it("cai para x-real-ip sem x-vercel-forwarded-for", () => {
    const h = new Headers({ "x-real-ip": "3.3.3.3" });
    expect(clientIp(h)).toBe("3.3.3.3");
  });
  it("cai para o primeiro de x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "4.4.4.4, 5.5.5.5" });
    expect(clientIp(h)).toBe("4.4.4.4");
  });
  it("null sem nenhum cabeçalho", () => {
    expect(clientIp(new Headers())).toBeNull();
  });
  it("aceita qualquer objeto com .get (ReadonlyHeaders do next/headers)", () => {
    const fake = { get: (name: string) => (name === "x-real-ip" ? "9.9.9.9" : null) };
    expect(clientIp(fake)).toBe("9.9.9.9");
  });
});
