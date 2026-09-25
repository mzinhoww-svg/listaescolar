import { describe, expect, it } from "vitest";

import { buildLeadMessage, buildLeadWhatsappUrl, leadListUrl } from "@/features/leads/message";

const SITE = "https://listacerta.example";
const base = {
  code: "LC-5TJ1",
  schoolName: "Escola Demonstração",
  gradeLabel: "5º ano",
  schoolYear: 2027,
  listUrl: leadListUrl(SITE, "LC-5TJ1"),
};

// Perfil e estudante fictícios que existem no mesmo contexto da chamada (nunca podem vazar).
const PROFILE = { displayName: "Maria Aparecida Souza", email: "maria.souza@example.test", phone: "(65) 99876-5432", cpf: "123.456.789-09" };
const STUDENT = { nickname: "Joãozinho Pereira", birthDate: "2015-03-04" };

const CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /\+?\d(?:[\s().-]?\d){7,}/;

function textOf(url: string): string {
  return decodeURIComponent(new URL(url).searchParams.get("text") ?? "");
}

describe("buildLeadMessage", () => {
  it("texto fixo em português com código, escola, série, ano e link", () => {
    expect(buildLeadMessage(base)).toBe(
      [
        "Olá! Vim pela ListaCerta e gostaria de uma cotação da lista de material escolar.",
        "Código: LC-5TJ1",
        "Escola: Escola Demonstração",
        "Série: 5º ano (2027)",
        "Lista: https://listacerta.example/papelaria/leads/LC-5TJ1",
      ].join("\n"),
    );
  });

  it("recusa campos extras (perfil, estudante, e-mail): Zod strict", () => {
    for (const extra of [PROFILE, STUDENT, { studentName: "Ana" }, { email: "a@b.co" }, { neighborhood: "Centro" }]) {
      expect(() => buildLeadMessage({ ...base, ...extra } as never)).toThrow();
    }
  });

  it("aceite: contexto com perfil e estudante hostis não aparece no texto nem na URL", () => {
    const input = { ...base, ...({} as object) };
    const url = buildLeadWhatsappUrl("+5565999990000", input, { siteOrigin: SITE });
    expect(url).not.toBeNull();
    const all = `${buildLeadMessage(input)} ${textOf(url as string)}`;
    for (const secret of [...Object.values(PROFILE), ...Object.values(STUDENT), "Maria", "Souza", "Joãozinho"]) {
      expect(all).not.toContain(secret);
      expect(decodeURIComponent(url as string)).not.toContain(secret);
    }
    expect(all).not.toMatch(CPF);
    expect(all).not.toMatch(EMAIL);
    expect(all).not.toMatch(PHONE);
  });

  it("remove controle, quebras, e-mail, CPF e telefone digitados dentro de escola e série", () => {
    const hostile = {
      ...base,
      schoolName: `Escola\nMaria Souza\r\n${PROFILE.cpf} ${PROFILE.email} ${PROFILE.phone}\u0000‮%0A`,
      gradeLabel: `5º\tano​ 65 99999-1234`,
    };
    const msg = buildLeadMessage(hostile);
    expect(msg.split("\n")).toHaveLength(5);
    expect(msg).not.toMatch(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮]/);
    expect(msg).not.toMatch(CPF);
    expect(msg).not.toMatch(EMAIL);
    expect(msg).not.toMatch(PHONE);
    expect(msg).not.toContain(PROFILE.cpf);
  });

  it("limita tamanhos", () => {
    const msg = buildLeadMessage({ ...base, schoolName: "E".repeat(1500), gradeLabel: "S".repeat(1500) });
    expect(msg.length).toBeLessThan(600);
    // entrada absurda é recusada, não processada
    expect(() => buildLeadMessage({ ...base, schoolName: "E".repeat(5000) })).toThrow();
  });

  it("recusa campos vazios depois de limpar, ano fora do intervalo e código inválido", () => {
    expect(() => buildLeadMessage({ ...base, schoolName: "\n\n  \u0000" })).toThrow();
    expect(() => buildLeadMessage({ ...base, schoolName: "joao@example.test" })).toThrow();
    expect(() => buildLeadMessage({ ...base, schoolYear: 1999 })).toThrow();
    expect(() => buildLeadMessage({ ...base, schoolYear: 2027.5 })).toThrow();
    expect(() => buildLeadMessage({ ...base, code: "LC-ZZZU" })).toThrow();
  });

  describe("link da lista", () => {
    const bad = [
      "https://listacerta.example/papelaria/leads/LC-OUTRO",
      "https://listacerta.example/papelaria/leads/LC-5TJ1?next=https://evil.example",
      "https://listacerta.example/papelaria/leads/LC-5TJ1#x",
      "https://user:pw@listacerta.example/papelaria/leads/LC-5TJ1",
      "https://listacerta.example/other/LC-5TJ1",
      "javascript:alert(1)",
      "//evil.example/papelaria/leads/LC-5TJ1",
      "/papelaria/leads/LC-5TJ1",
      "ftp://listacerta.example/papelaria/leads/LC-5TJ1",
      "https://evil.example/papelaria/leads/LC-5TJ1",
      "https://listacerta.example.evil.example/papelaria/leads/LC-5TJ1",
    ];
    for (const listUrl of bad) {
      it(`recusa ${listUrl}`, () => {
        expect(() => buildLeadMessage({ ...base, listUrl }, { siteOrigin: SITE })).toThrow();
      });
    }
    it("sem siteOrigin ainda recusa forma inválida", () => {
      expect(() => buildLeadMessage({ ...base, listUrl: "https://a.example/x" })).toThrow();
    });
    it("leadListUrl monta só com a origem do site", () => {
      expect(leadListUrl("https://listacerta.example/", "LC-5TJ1")).toBe("https://listacerta.example/papelaria/leads/LC-5TJ1");
      expect(() => leadListUrl("not a url", "LC-5TJ1")).toThrow();
      expect(() => leadListUrl(SITE, "LC-xx")).toThrow();
    });
  });
});

describe("buildLeadWhatsappUrl", () => {
  it("wa.me com o número da papelaria e o texto codificado", () => {
    const url = buildLeadWhatsappUrl("(65) 99999-0000", base, { siteOrigin: SITE }) as string;
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.host).toBe("wa.me");
    expect(parsed.pathname).toBe("/5565999990000");
    expect([...parsed.searchParams.keys()]).toEqual(["text"]);
    expect(textOf(url)).toBe(buildLeadMessage(base));
    expect(url).not.toMatch(/[\n\r ]/);
  });

  it("número inválido, vazio ou hostil vira null (sem open redirect)", () => {
    for (const phone of ["", "abc", "123", "https://evil.example", "+5565999990000/../../x", "65 99999-0000@evil.example", "+55"]) {
      expect(buildLeadWhatsappUrl(phone, base, { siteOrigin: SITE })).toBeNull();
    }
  });

  it("entrada inválida vira null", () => {
    expect(buildLeadWhatsappUrl("+5565999990000", { ...base, extra: 1 } as never, { siteOrigin: SITE })).toBeNull();
    expect(buildLeadWhatsappUrl("+5565999990000", { ...base, listUrl: "https://evil.example/x" }, { siteOrigin: SITE })).toBeNull();
  });

  it("nome de escola com &, #, ? e emoji não quebra a URL", () => {
    const url = buildLeadWhatsappUrl("+5565999990000", { ...base, schoolName: "A&B #1 ? 🎒 Escola" }, { siteOrigin: SITE }) as string;
    const p = new URL(url);
    expect([...p.searchParams.keys()]).toEqual(["text"]);
    expect(p.hash).toBe("");
    expect(textOf(url)).toContain("A&B #1 ? 🎒 Escola");
  });
});

describe("cleanLeadText (revisão T2)", () => {
  it("remove marca bidi U+061C, hífen suave e caracteres de tag", async () => {
    const { cleanLeadText } = await import("@/features/leads/message");
    expect(cleanLeadText("Es؜cola­X\u{E0041}Y", 50)).toBe("Es cola X Y");
  });
  it("redige URLs", async () => {
    const { cleanLeadText } = await import("@/features/leads/message");
    expect(cleanLeadText("Escola https://evil.example/x?a=1 e www.evil.example/p", 80)).toBe("Escola e");
  });
});
