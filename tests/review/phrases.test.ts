import { describe, expect, it } from "vitest";
import { REASON_CODES } from "@/supabase/functions/_shared/publication/codes.ts";
import { ALERT_CODE_LIST } from "@/supabase/functions/_shared/extraction-schema";
import { alertLabel, blockerPhrase, rejectReasonLabel, reasonPhrase } from "@/features/review/phrases";
import { BLOCKER_CODES, REJECT_REASONS } from "@/features/review/codes";

const LEGAL = /\b(lei|procon|ilegal|ilegais|viola\w*|juríd\w*|infração)\b/i;

describe("reasonPhrase", () => {
  it("cobre TODOS os REASON_CODES da S09 com frase própria (sem código cru)", () => {
    for (const code of REASON_CODES) {
      const p = reasonPhrase(code);
      expect(p, code).not.toBe("");
      expect(p, code).not.toContain(code);
      expect(p, code).not.toMatch(/^Falha técnica/);
    }
  });
  it("frases-chave do plano", () => {
    expect(reasonPhrase("critical_alert")).toBe("Alerta crítico no documento");
    expect(reasonPhrase("item_flagged")).toBe("Itens sinalizados para conferência");
    expect(reasonPhrase("parent_submission")).toBe("Enviada por família: sempre revisada pela equipe");
    expect(reasonPhrase("submitter_not_linked")).toBe("Remetente sem vínculo confirmado com a escola");
    expect(reasonPhrase("publisher_unavailable")).toBe("Publicação automática indisponível neste ambiente");
  });
  it("falhas de publicação da S09 têm frase e o resto cai no fallback com o código", () => {
    for (const c of ["publish_expired", "publish_rejected", "invalid_publish_result", "idempotency_conflict", "no_items"]) {
      expect(reasonPhrase(c), c).not.toMatch(/^Falha técnica/);
    }
    expect(reasonPhrase("qualquer_coisa")).toBe("Falha técnica na publicação (código qualquer_coisa)");
  });
  it("nunca devolve texto livre: código fora do alfabeto vira fallback sem o texto", () => {
    const p = reasonPhrase("<img src=x onerror=alert(1)>");
    expect(p).not.toContain("<");
    expect(p).toMatch(/^Falha técnica na publicação/);
  });
});

describe("alertLabel, blockerPhrase, rejectReasonLabel", () => {
  it("rótulo neutro para os 7 alertas, sem linguagem jurídica", () => {
    for (const c of ALERT_CODE_LIST) {
      expect(alertLabel(c), c).not.toMatch(LEGAL);
      expect(alertLabel(c)).not.toBe("");
    }
    expect(alertLabel("restrictive_brand_or_spec")).toBe("Marca ou especificação exigida: conferir antes de publicar.");
    expect(alertLabel("desconhecido")).toBe("Alerta do documento");
  });
  it("todo bloqueio e todo motivo de recusa tem frase fixa, sem linguagem jurídica", () => {
    for (const c of BLOCKER_CODES) expect(blockerPhrase(c), c).not.toMatch(LEGAL);
    for (const c of REJECT_REASONS) {
      expect(rejectReasonLabel(c), c).not.toBe("");
      expect(rejectReasonLabel(c), c).not.toMatch(LEGAL);
    }
  });
});
