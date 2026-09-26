import { describe, expect, it } from "vitest";

import { aggregateSurvey } from "@/lib/pesquisa/agregacao";
import type { SurveyLeadRow, SurveyResponseRow } from "@/lib/pesquisa/repositorio";

function baseResposta(sessionId: string): SurveyResponseRow {
  return {
    id: sessionId,
    session_id: sessionId,
    survey_version: "maes-2026-09",
    answers: {},
    last_step: 0,
    source_group: null,
    ref_session_id: null,
    ip_hash: null,
    user_agent: null,
    started_at: "2026-09-25T10:00:00.000Z",
    created_at: "2026-09-25T10:00:00.000Z",
    updated_at: "2026-09-25T10:00:00.000Z",
    completed_at: null,
  };
}

function baseLead(sessionId: string): SurveyLeadRow {
  return {
    id: sessionId,
    session_id: sessionId,
    name: null,
    whatsapp_e164: "+5565999990000",
    consent_text:
      "Aceito receber mensagens da ListaCerta pelo WhatsApp sobre a lista escolar. Posso cancelar quando quiser.",
    consent_at: "2026-09-25T10:05:00.000Z",
    created_at: "2026-09-25T10:05:00.000Z",
    updated_at: "2026-09-25T10:05:00.000Z",
    source_group: null,
  };
}

// Cenário principal: 5 sessões (s1..s5), 3 completas (s1,s2,s3), 2 leads (s1,s2).
// Durações das completas: s1=60s, s2=120s, s3=180s -> mediana ímpar = 120.
const s1 = {
  ...baseResposta("s1"),
  started_at: "2026-09-25T10:00:00.000Z",
  completed_at: "2026-09-25T10:01:00.000Z",
  last_step: 12,
  source_group: "whatsapp",
  answers: {
    cidade: "cuiaba",
    filhos: "1",
    onde_comprou: ["papelaria_bairro", "internet"],
    dores: ["preco_alto", "achar_itens"],
    compra_ideal: "Seria ótimo ter tudo pronto",
    pode_citar: true,
  },
};
const s2 = {
  ...baseResposta("s2"),
  started_at: "2026-09-25T10:00:00.000Z",
  completed_at: "2026-09-25T10:02:00.000Z",
  last_step: 12,
  source_group: "whatsapp",
  answers: {
    cidade: "cuiaba",
    filhos: "2",
    onde_comprou: ["internet"],
    compra_ideal: "", // vazia: não deve virar frase mesmo com pode_citar=true
    pode_citar: true,
  },
};
const s3 = {
  ...baseResposta("s3"),
  started_at: "2026-09-25T10:00:00.000Z",
  completed_at: "2026-09-25T10:03:00.000Z",
  last_step: 12,
  source_group: null,
  answers: {
    cidade: "varzea_grande",
    filhos: "3_ou_mais",
    compra_ideal: "Quero praticidade",
    pode_citar: false,
  },
};
const s4 = {
  ...baseResposta("s4"),
  last_step: 7,
  source_group: "instagram",
  answers: { cidade: "cuiaba", gasto: "ate_200" },
};
const s5 = { ...baseResposta("s5"), last_step: 0, source_group: null, answers: {} };

const RESPONSES: SurveyResponseRow[] = [s1, s2, s3, s4, s5];
const LEAD_S1 = { ...baseLead("s1"), name: "Maria", whatsapp_e164: "+5565999991111" };
const LEAD_S2 = { ...baseLead("s2"), name: null, whatsapp_e164: "+5565999992222" };
const LEADS: SurveyLeadRow[] = [LEAD_S1, LEAD_S2];

describe("aggregateSurvey — cartões", () => {
  it("conta iniciadas, completas, leads e taxas conferidas à mão", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    expect(stats.cartoes.iniciadas).toBe(5);
    expect(stats.cartoes.completas).toBe(3);
    expect(stats.cartoes.taxaConclusao).toBe(3 / 5);
    expect(stats.cartoes.leads).toBe(2);
    expect(stats.cartoes.taxaLead).toBe(2 / 3);
  });

  it("mediana ímpar (3 completas: 60s, 120s, 180s) = valor central", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    expect(stats.cartoes.tempoMedianoSegundos).toBe(120);
  });

  it("mediana par (4 completas: 60s, 120s, 180s, 240s) = média das duas centrais", () => {
    const quatro: SurveyResponseRow[] = [
      { ...baseResposta("p1"), completed_at: "2026-09-25T10:01:00.000Z", last_step: 12 },
      { ...baseResposta("p2"), completed_at: "2026-09-25T10:02:00.000Z", last_step: 12 },
      { ...baseResposta("p3"), completed_at: "2026-09-25T10:03:00.000Z", last_step: 12 },
      { ...baseResposta("p4"), completed_at: "2026-09-25T10:04:00.000Z", last_step: 12 },
    ];
    const stats = aggregateSurvey(quatro, []);
    expect(stats.cartoes.tempoMedianoSegundos).toBe((120 + 180) / 2);
  });

  it("nenhuma completa: mediana null, taxas 0, sem divisão por zero", () => {
    const stats = aggregateSurvey([baseResposta("q1"), baseResposta("q2")], []);
    expect(stats.cartoes.completas).toBe(0);
    expect(stats.cartoes.tempoMedianoSegundos).toBeNull();
    expect(stats.cartoes.taxaLead).toBe(0);
  });

  it("nenhuma linha: iniciadas 0 e taxaConclusao 0 (não NaN)", () => {
    const stats = aggregateSurvey([], []);
    expect(stats.cartoes.iniciadas).toBe(0);
    expect(stats.cartoes.taxaConclusao).toBe(0);
    expect(stats.cartoes.tempoMedianoSegundos).toBeNull();
  });
});

describe("aggregateSurvey — funil", () => {
  it("tem 13 entradas (step 0 a 12), na ordem, e soma o total de sessões", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    expect(stats.funil).toHaveLength(13);
    expect(stats.funil.map((f) => f.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(stats.funil.reduce((soma, f) => soma + f.sessoes, 0)).toBe(RESPONSES.length);
    expect(stats.funil.find((f) => f.step === 0)!.sessoes).toBe(1); // s5
    expect(stats.funil.find((f) => f.step === 7)!.sessoes).toBe(1); // s4
    expect(stats.funil.find((f) => f.step === 12)!.sessoes).toBe(3); // s1, s2, s3
    expect(stats.funil.find((f) => f.step === 5)!.sessoes).toBe(0);
  });
});

describe("aggregateSurvey — por pergunta", () => {
  it("cidade: contagem e percentual sobre quem respondeu (independente de completar)", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    const cidade = stats.porPergunta.find((p) => p.campo === "cidade")!;
    // s1, s2, s3, s4 respondem cidade (s5 não); s4 nem completou e ainda assim conta.
    expect(cidade.respondentes).toBe(4);
    const cuiaba = cidade.opcoes.find((o) => o.slug === "cuiaba")!;
    const varzea = cidade.opcoes.find((o) => o.slug === "varzea_grande")!;
    const outra = cidade.opcoes.find((o) => o.slug === "outra")!;
    expect(cuiaba.contagem).toBe(3);
    expect(cuiaba.percentual).toBe(3 / 4);
    expect(varzea.contagem).toBe(1);
    expect(varzea.percentual).toBe(1 / 4);
    expect(outra.contagem).toBe(0);
    expect(outra.percentual).toBe(0);
  });

  it("onde_comprou (múltipla escolha): cada slug conta uma vez por linha", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    const ondeComprou = stats.porPergunta.find((p) => p.campo === "onde_comprou")!;
    expect(ondeComprou.respondentes).toBe(2); // s1, s2
    expect(ondeComprou.opcoes.find((o) => o.slug === "papelaria_bairro")!.contagem).toBe(1);
    expect(ondeComprou.opcoes.find((o) => o.slug === "internet")!.contagem).toBe(2);
    expect(ondeComprou.opcoes.find((o) => o.slug === "internet")!.percentual).toBe(1);
    expect(ondeComprou.opcoes.find((o) => o.slug === "loja_grande")!.contagem).toBe(0);
  });

  it("campo sem nenhuma resposta: respondentes 0 e percentual 0 em todas as opções (sem NaN)", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    const usaria = stats.porPergunta.find((p) => p.campo === "usaria")!;
    expect(usaria.respondentes).toBe(0);
    for (const opcao of usaria.opcoes) {
      expect(opcao.contagem).toBe(0);
      expect(opcao.percentual).toBe(0);
    }
  });

  it("inclui os 12 campos de escolha da spec, cada um só uma vez", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    expect(stats.porPergunta.map((p) => p.campo)).toEqual([
      "cidade",
      "filhos",
      "rede",
      "etapas",
      "recebimento",
      "onde_comprou",
      "gasto",
      "tempo",
      "comparou",
      "dores",
      "usaria",
      "canal",
    ]);
  });

  it("ignora valor que não é slug conhecido, mas ainda conta como respondente", () => {
    const linha = { ...baseResposta("x1"), answers: { cidade: "planeta-desconhecido" } };
    const stats = aggregateSurvey([linha], []);
    const cidade = stats.porPergunta.find((p) => p.campo === "cidade")!;
    expect(cidade.respondentes).toBe(1);
    expect(cidade.opcoes.every((o) => o.contagem === 0)).toBe(true);
  });
});

describe("aggregateSurvey — por origem", () => {
  it("agrupa por source_group e mantém null como grupo próprio", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    expect(stats.porOrigem).toHaveLength(3); // whatsapp, null, instagram

    const whatsapp = stats.porOrigem.find((o) => o.sourceGroup === "whatsapp")!;
    expect(whatsapp.iniciadas).toBe(2); // s1, s2
    expect(whatsapp.completas).toBe(2);

    const semOrigem = stats.porOrigem.find((o) => o.sourceGroup === null)!;
    expect(semOrigem.iniciadas).toBe(2); // s3, s5
    expect(semOrigem.completas).toBe(1); // só s3

    const instagram = stats.porOrigem.find((o) => o.sourceGroup === "instagram")!;
    expect(instagram.iniciadas).toBe(1); // s4
    expect(instagram.completas).toBe(0);
  });
});

describe("aggregateSurvey — frases", () => {
  it("só inclui compra_ideal não vazia com pode_citar === true", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    expect(stats.frases).toEqual(["Seria ótimo ter tudo pronto"]);
  });

  it("nunca inclui nome, telefone ou session_id presentes nas fixtures de leads", () => {
    const stats = aggregateSurvey(RESPONSES, LEADS);
    const fraseUnica = stats.frases.join(" | ");
    expect(fraseUnica).not.toContain("Maria");
    expect(fraseUnica).not.toContain("999991111");
    expect(fraseUnica).not.toContain("+5565999991111");
    expect(fraseUnica).not.toContain("999992222");
    expect(fraseUnica).not.toContain("s1");
    expect(fraseUnica).not.toContain("s2");
  });

  it("ignora pode_citar ausente ou false, e compra_ideal ausente", () => {
    const linhas: SurveyResponseRow[] = [
      {
        ...baseResposta("y1"),
        answers: { compra_ideal: "Não deveria aparecer", pode_citar: false },
      },
      { ...baseResposta("y2"), answers: { pode_citar: true } }, // sem compra_ideal
      { ...baseResposta("y3"), answers: { compra_ideal: "   ", pode_citar: true } }, // só espaços
    ];
    const stats = aggregateSurvey(linhas, []);
    expect(stats.frases).toEqual([]);
  });
});
