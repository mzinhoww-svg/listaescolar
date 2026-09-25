import { describe, expect, it } from "vitest";
import { leadsToCsv, respostasToCsv } from "@/app/api/pesquisa/_lib/csv";
import type { SurveyLeadRow, SurveyResponseRow } from "@/lib/pesquisa/repositorio";

function baseResposta(overrides: Partial<SurveyResponseRow> = {}): SurveyResponseRow {
  return {
    id: "1",
    session_id: "11111111-1111-4111-8111-111111111111",
    survey_version: "maes-2026-09",
    answers: {},
    last_step: 12,
    source_group: "e2e-teste",
    ref_session_id: null,
    ip_hash: null,
    user_agent: null,
    started_at: "2026-09-25T10:00:00.000Z",
    created_at: "2026-09-25T10:00:00.000Z",
    updated_at: "2026-09-25T10:05:00.000Z",
    completed_at: "2026-09-25T10:05:00.000Z",
    ...overrides,
  };
}

function baseLead(overrides: Partial<SurveyLeadRow> = {}): SurveyLeadRow {
  return {
    id: "1",
    session_id: "11111111-1111-4111-8111-111111111111",
    name: null,
    whatsapp_e164: "+5565999991234",
    consent_text: "texto",
    consent_at: "2026-09-25T10:05:00.000Z",
    created_at: "2026-09-25T10:05:00.000Z",
    updated_at: "2026-09-25T10:05:00.000Z",
    source_group: "e2e-teste",
    ...overrides,
  };
}

describe("respostasToCsv", () => {
  it("nunca deixa um campo começar com =, +, - ou @ (injeção de fórmula no Excel/Sheets)", () => {
    const csv = respostasToCsv([
      baseResposta({
        answers: {
          compra_ideal: '=HYPERLINK("http://evil","x")',
          escola: "+1+1",
        },
      }),
    ]);
    expect(csv).not.toContain(",=HYPERLINK");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1+1");
  });

  it("prefixa também -formula e @formula", () => {
    const csv = respostasToCsv([
      baseResposta({ answers: { compra_ideal: "-2+3", escola: "@cmd" } }),
    ]);
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@cmd");
  });

  it("não mexe em texto comum", () => {
    const csv = respostasToCsv([baseResposta({ answers: { compra_ideal: "Tudo mais rápido" } })]);
    expect(csv).toContain("Tudo mais rápido");
    expect(csv).not.toContain("'Tudo");
  });

  it("junta arrays com ; e escapa vírgula/aspas/quebra de linha", () => {
    const csv = respostasToCsv([
      baseResposta({
        answers: { dores: ["preco_alto", "falta_tempo"], escola: 'Escola "Boa", Ltda' },
      }),
    ]);
    expect(csv).toContain("preco_alto;falta_tempo");
    expect(csv).toContain('"Escola ""Boa"", Ltda"');
  });

  it("tem BOM UTF-8 e cabeçalho na ordem das telas 1-12 + metadados", () => {
    const csv = respostasToCsv([baseResposta()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")[0]).toBe(
      "cidade,filhos,rede,escola,etapas,recebimento,onde_comprou,gasto,tempo,comparou,dores,usaria,canal,compra_ideal,pode_citar,source_group,started_at,completed_at,last_step",
    );
  });
});

describe("leadsToCsv", () => {
  it("sanitiza nome contra fórmula também", () => {
    const csv = leadsToCsv([baseLead({ name: "=cmd|'/C calc'" })]);
    expect(csv).toContain("'=cmd");
  });

  it("cabeçalho e conteúdo corretos (whatsapp_e164 começa com + então também leva o prefixo anti-fórmula)", () => {
    const csv = leadsToCsv([baseLead({ name: "Maria" })]);
    expect(csv.slice(1).split("\r\n")[0]).toBe("name,whatsapp_e164,consent_at,source_group");
    expect(csv).toContain("Maria,'+5565999991234");
  });
});
