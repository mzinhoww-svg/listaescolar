import { describe, expect, it } from "vitest";

import { gradeSlugSchema, nicknameSchema, schoolYearSchema, studentFieldsSchema } from "@/features/students/schemas";

const codeOf = (r: ReturnType<typeof nicknameSchema.safeParse>): string | undefined => {
  if (r.success) return undefined;
  const issue = r.error.issues[0];
  return issue?.code === "custom" ? (issue.params as { code?: string } | undefined)?.code : undefined;
};

describe("nicknameSchema", () => {
  it("aceita apelido único sem sobrenome nem dígito, aparado", () => {
    expect(nicknameSchema.safeParse("Maria").success).toBe(true);
    expect(nicknameSchema.parse("  Ana-Clara  ")).toBe("Ana-Clara");
  });

  it("recusa vazio, sobrenome (espaço), dígito, tamanho e controle — cada um com o código certo", () => {
    expect(codeOf(nicknameSchema.safeParse(""))).toBe("nickname_required");
    expect(codeOf(nicknameSchema.safeParse("   "))).toBe("nickname_required");
    expect(codeOf(nicknameSchema.safeParse("Maria Silva"))).toBe("nickname_has_surname");
    expect(codeOf(nicknameSchema.safeParse("a"))).toBe("nickname_length");
    expect(codeOf(nicknameSchema.safeParse("x".repeat(31)))).toBe("nickname_length");
    expect(codeOf(nicknameSchema.safeParse("Aluno123"))).toBe("nickname_digits");
    expect(codeOf(nicknameSchema.safeParse("Maria\u0007"))).toBe("nickname_invalid");
  });
});

describe("gradeSlugSchema", () => {
  it("aceita slug do catálogo; recusa desconhecido", () => {
    expect(gradeSlugSchema.safeParse("ef-1").success).toBe(true);
    expect(gradeSlugSchema.safeParse("nao-existe").success).toBe(false);
  });
});

describe("schoolYearSchema", () => {
  it("só aceita o ano corrente ou o seguinte (fuso de Cuiabá)", () => {
    const now = new Date("2026-09-27T12:00:00-04:00");
    const schema = schoolYearSchema(now);
    expect(schema.safeParse(2026).success).toBe(true);
    expect(schema.safeParse(2027).success).toBe(true);
    expect(schema.safeParse(2028).success).toBe(false);
    expect(schema.safeParse(2025).success).toBe(false);
  });
});

describe("studentFieldsSchema", () => {
  it("valida o conjunto completo", () => {
    const now = new Date("2026-09-27T12:00:00-04:00");
    const schema = studentFieldsSchema(now);
    const ok = schema.safeParse({ nickname: "Maria", schoolId: "00000000-0000-4000-8000-000000000001", gradeSlug: "ef-1", schoolYear: 2027 });
    expect(ok.success).toBe(true);
    expect(schema.safeParse({ nickname: "Maria Silva", schoolId: "x", gradeSlug: "ef-1", schoolYear: 2027 }).success).toBe(false);
  });
});
