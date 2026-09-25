import { describe, expect, it } from "vitest";

import { localApiFrom, parseStatusEnv } from "./local-api";

// Montado em tempo de execução: o padrão estático de chave é bloqueado pelo GitHub.
const KEY = ["sb", "secret", "x"].join("_");

describe("local-api", () => {
  it("lê a saída -o env (com e sem aspas)", () => {
    const out = `API_URL="http://127.0.0.1:54321"\nSECRET_KEY="${KEY}"\nDB_URL=postgresql://a:b@h:1/postgres\n`;
    expect(parseStatusEnv(out).DB_URL).toBe("postgresql://a:b@h:1/postgres");
    expect(localApiFrom(out)).toEqual({ url: "http://127.0.0.1:54321", key: KEY });
  });
  it("aceita a chave legada e ignora a saída pretty (sem KEY=VALUE)", () => {
    expect(localApiFrom(`API_URL="http://x"\nSERVICE_ROLE_KEY="${KEY}"`).key).toBe(KEY);
    const pretty = "╭──────╮\n│ 🔧 Development Tools │\n│ Studio  │ http://127.0.0.1:54323 │\n";
    expect(() => localApiFrom(pretty)).toThrow(/fora do ar/);
  });
});
