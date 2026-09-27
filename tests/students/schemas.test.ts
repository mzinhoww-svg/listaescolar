import { describe, expect, it } from "vitest";

import { gradeSlugSchema, nicknameSchema, studentFieldsSchema } from "@/features/students/schemas";

const codeOf = (r: ReturnType<typeof nicknameSchema.safeParse>): string | undefined => {
  if (r.success) return undefined;
  const issue = r.error.issues[0];
  return issue?.code === "custom" ? (issue.params as { code?: string } | undefined)?.code : undefined;
};

describe("nicknameSchema", () => {
  it("aceita apelido só com letras, aparado e normalizado (NFC); apóstrofo curvo vira reto", () => {
    expect(nicknameSchema.safeParse("Maria").success).toBe(true);
    expect(nicknameSchema.parse("  Maria  ")).toBe("Maria");
    expect(nicknameSchema.parse("D’Alva")).toBe("D'Alva"); // apóstrofo curvo -> reto
    expect(nicknameSchema.safeParse("D'Alva").success).toBe(true); // apóstrofo reto direto
    expect(nicknameSchema.parse("Zé")).toBe("Zé"); // NFD (e + acento combinante) -> NFC

    // reverificação de segurança (abf5f4e): nome latino acentuado continua aceito depois de restringir a
    // \p{Script=Latin} (Latin-1 Supplement / Latin Extended-A).
    expect(nicknameSchema.safeParse("João").success).toBe(true);
    expect(nicknameSchema.safeParse("Ângela").success).toBe(true);
    expect(nicknameSchema.safeParse("Çelo").success).toBe(true);
  });

  it("recusa vazio, sobrenome (espaço), tamanho, hífen, ponto, sublinhado, arroba, dígito e invisível — código certo", () => {
    expect(codeOf(nicknameSchema.safeParse(""))).toBe("nickname_required");
    expect(codeOf(nicknameSchema.safeParse("   "))).toBe("nickname_required");
    expect(codeOf(nicknameSchema.safeParse("Maria Silva"))).toBe("nickname_has_surname");
    expect(codeOf(nicknameSchema.safeParse("a"))).toBe("nickname_length");
    expect(codeOf(nicknameSchema.safeParse("x".repeat(31)))).toBe("nickname_length");
    // achados da revisão de segurança: só letras, nada de hífen/ponto/sublinhado/arroba/dígito/invisível
    expect(codeOf(nicknameSchema.safeParse("Maria-Silva"))).toBe("nickname_invalid");
    expect(codeOf(nicknameSchema.safeParse("Maria.Silva"))).toBe("nickname_invalid");
    expect(codeOf(nicknameSchema.safeParse("Maria_Silva"))).toBe("nickname_invalid");
    expect(codeOf(nicknameSchema.safeParse("joao@gmail.com"))).toBe("nickname_invalid");
    expect(codeOf(nicknameSchema.safeParse("Aluno123"))).toBe("nickname_invalid");
    expect(codeOf(nicknameSchema.safeParse("Maria\u0007Silva"))).toBe("nickname_invalid"); // controle
    expect(codeOf(nicknameSchema.safeParse("Maria​Silva"))).toBe("nickname_invalid"); // zero-width space, sem espaço visível
  });

  it("reverificação de segurança (abf5f4e): recusa preenchedor de Hangul, apóstrofo-letra U+02BC e outro script (cirílico)", () => {
    // \p{L} aceitava essas "letras" que não são letra de verdade; \p{Script=Latin} corrige.
    expect(codeOf(nicknameSchema.safeParse("MariaㅤSilva"))).toBe("nickname_invalid"); // U+3164 HANGUL FILLER
    expect(codeOf(nicknameSchema.safeParse("MariaﾠSilva"))).toBe("nickname_invalid"); // U+FFA0 HALFWIDTH HANGUL FILLER
    expect(codeOf(nicknameSchema.safeParse("MariaᅟSilva"))).toBe("nickname_invalid"); // U+115F HANGUL CHOSEONG FILLER
    expect(codeOf(nicknameSchema.safeParse("MariaᅠSilva"))).toBe("nickname_invalid"); // U+1160 HANGUL JUNGSEONG FILLER
    expect(codeOf(nicknameSchema.safeParse("MariaʼSilva"))).toBe("nickname_invalid"); // U+02BC MODIFIER LETTER APOSTROPHE
    expect(codeOf(nicknameSchema.safeParse("Мария"))).toBe("nickname_invalid"); // cirílico
  });
});

describe("gradeSlugSchema", () => {
  it("aceita slug do catálogo; recusa desconhecido", () => {
    expect(gradeSlugSchema.safeParse("ef-1").success).toBe(true);
    expect(gradeSlugSchema.safeParse("nao-existe").success).toBe(false);
  });
});

describe("studentFieldsSchema", () => {
  it("valida só apelido e série (SPEC §5) — nenhum outro campo", () => {
    const ok = studentFieldsSchema.safeParse({ nickname: "Maria", gradeSlug: "ef-1" });
    expect(ok.success).toBe(true);
    expect(studentFieldsSchema.safeParse({ nickname: "Maria Silva", gradeSlug: "ef-1" }).success).toBe(false);
    expect(studentFieldsSchema.safeParse({ nickname: "Maria", gradeSlug: "nao-existe" }).success).toBe(false);
  });
});
