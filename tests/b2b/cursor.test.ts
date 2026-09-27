import { describe, expect, it } from "vitest";
import { z } from "zod";

import { decodeCursor, encodeCursor } from "@/features/b2b/api/cursor";

const schema = z.object({ name: z.string(), inep: z.string() }).strict();

describe("cursor", () => {
  it("roda-trip: encode -> decode devolve o mesmo payload", () => {
    const cursor = encodeCursor({ name: "escola x", inep: "12345678" });
    expect(decodeCursor(cursor, schema)).toEqual({ name: "escola x", inep: "12345678" });
  });

  it("base64 inválido -> null", () => {
    expect(decodeCursor("%%%not-base64%%%", schema)).toBeNull();
  });

  it("JSON inválido dentro do base64 -> null", () => {
    const cursor = Buffer.from("{ isto nao é json", "utf8").toString("base64url");
    expect(decodeCursor(cursor, schema)).toBeNull();
  });

  it("versão errada -> null (cursor adulterado ou de outra versão)", () => {
    const cursor = Buffer.from(JSON.stringify({ v: 2, name: "x", inep: "1" }), "utf8").toString("base64url");
    expect(decodeCursor(cursor, schema)).toBeNull();
  });

  it("payload que não bate com o esquema do endpoint -> null", () => {
    const cursor = Buffer.from(JSON.stringify({ v: 1, name: "x" }), "utf8").toString("base64url"); // falta inep
    expect(decodeCursor(cursor, schema)).toBeNull();
  });

  it("payload adulterado (campo trocado por tipo errado) -> null", () => {
    const cursor = Buffer.from(JSON.stringify({ v: 1, name: 123, inep: "1" }), "utf8").toString("base64url");
    expect(decodeCursor(cursor, schema)).toBeNull();
  });

  it("string vazia ou lixo qualquer -> null, nunca lança", () => {
    for (const junk of ["", "===", "null", "undefined"]) {
      expect(decodeCursor(junk, schema)).toBeNull();
    }
  });
});
