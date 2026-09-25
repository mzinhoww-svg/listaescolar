import { describe, expect, it } from "vitest";

import { LeadError } from "@/features/leads/errors";
import { errorMessageForCode, leadErrorCode, LEAD_ERROR_CODES } from "@/features/leads/messages";

describe("mensagens de erro do lead", () => {
  it("todo código do repositório tem texto fixo próprio", () => {
    for (const code of LEAD_ERROR_CODES) {
      const msg = errorMessageForCode(code);
      expect(msg).toBeTruthy();
    }
    expect(errorMessageForCode("consent_required")).toMatch(/consentimento|aceit/i);
    expect(errorMessageForCode("rate_limited")).toMatch(/limite|muitos/i);
  });

  it("código desconhecido, vazio ou hostil vira mensagem genérica, nunca eco", () => {
    const generic = errorMessageForCode("desconhecido");
    expect(errorMessageForCode(undefined)).toBeNull();
    expect(errorMessageForCode("")).toBeNull();
    for (const evil of ["<script>alert(1)</script>", "__proto__", "constructor", "toString", "não existe"]) {
      expect(errorMessageForCode(evil)).toBe(generic);
      expect(errorMessageForCode(evil)).not.toContain(evil);
    }
  });

  it("leadErrorCode só devolve códigos conhecidos", () => {
    expect(leadErrorCode(new LeadError("x", "rate_limited"))).toBe("rate_limited");
    expect(leadErrorCode(new Error("boom"))).toBe("desconhecido");
    expect(leadErrorCode("texto")).toBe("desconhecido");
    expect(leadErrorCode(new LeadError("x", "database"))).toBe("desconhecido");
  });

  it("nenhum texto promete preço, prazo ou resultado", () => {
    for (const code of LEAD_ERROR_CODES) expect(errorMessageForCode(code)).not.toMatch(/R\$|prazo de \d|garant/i);
  });
});
