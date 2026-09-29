import { describe, expect, it } from "vitest";
import { assertLocalUrls, isLocalUrl } from "../../scripts/lib/local-host.mjs";

describe("trava de host local", () => {
  it("aceita 127.0.0.1 e localhost", () => {
    expect(isLocalUrl("http://127.0.0.1:3003")).toBe(true);
    expect(isLocalUrl("http://localhost:54624/api")).toBe(true);
  });
  it("recusa hosts remotos, truques de subdomínio e lixo", () => {
    for (const u of ["https://listaescolar.vercel.app", "http://127.0.0.1.evil.com", "http://localhost.evil.com", "http://evil.com/?h=127.0.0.1", "not a url", "", "ftp://127.0.0.1"]) {
      expect(isLocalUrl(u)).toBe(false);
    }
  });
  it("assertLocalUrls aborta nomeando a variável", () => {
    expect(() => assertLocalUrls({ BASE: "http://127.0.0.1:3003", MAILPIT: "https://x.supabase.co" })).toThrow(/MAILPIT/);
    expect(() => assertLocalUrls({ BASE: "http://127.0.0.1:3003" })).not.toThrow();
  });
});
