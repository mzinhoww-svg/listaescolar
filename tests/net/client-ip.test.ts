import { describe, expect, it } from "vitest";

import { clientIp, ipRateKey } from "@/lib/net/client-ip";

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

describe("ipRateKey (reverificação S19, N4a)", () => {
  it("IPv4 fica como está", () => expect(ipRateKey("1.2.3.4")).toBe("1.2.3.4"));
  it("IPv6 no mesmo /64 vira a mesma chave, em qualquer forma de escrita", () => {
    const a = ipRateKey("2001:db8:abcd:12:1111:2222:3333:4444");
    expect(ipRateKey("2001:0db8:abcd:0012:ffff::1")).toBe(a);
    expect(ipRateKey("2001:db8:abcd:13::1")).not.toBe(a);
  });
  it("expande '::' e trata IPv4 mapeado", () => {
    expect(ipRateKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipRateKey("::ffff:9.9.9.9")).toBe("9.9.9.9");
  });
});
