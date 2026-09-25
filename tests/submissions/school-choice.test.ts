import { describe, expect, it } from "vitest";
import { resolveSchoolChoice } from "@/features/submissions/school-choice";

const A = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11";
const B = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b22";

describe("resolveSchoolChoice (D-002)", () => {
  it("sem escola: envio como família, para qualquer papel (a equipe atribui a escola na revisão)", () => {
    for (const role of ["parent", "school_member", "admin"] as const) {
      for (const schoolId of [undefined, null, ""]) expect(resolveSchoolChoice({ role, schoolId, linkedSchoolIds: [] })).toEqual({ ok: true, source: "parent" });
    }
  });
  it("família escolhe QUALQUER escola (município habilitado é conferido no servidor): continua envio de família", () => {
    expect(resolveSchoolChoice({ role: "parent", schoolId: A, linkedSchoolIds: [] })).toEqual({ ok: true, source: "parent", schoolId: A });
  });
  it("school_member/admin: só as escolas VINCULADAS; envio vira da escola", () => {
    expect(resolveSchoolChoice({ role: "school_member", schoolId: A, linkedSchoolIds: [A, B] })).toEqual({ ok: true, source: "school", schoolId: A });
    expect(resolveSchoolChoice({ role: "school_member", schoolId: A, linkedSchoolIds: [B] })).toEqual({ ok: false, code: "school_not_linked" });
    expect(resolveSchoolChoice({ role: "admin", schoolId: A, linkedSchoolIds: [] })).toEqual({ ok: false, code: "school_not_linked" });
  });
  it("escola que não é uuid: invalid_input", () => {
    expect(resolveSchoolChoice({ role: "parent", schoolId: "x", linkedSchoolIds: [] })).toEqual({ ok: false, code: "invalid_input" });
    expect(resolveSchoolChoice({ role: "school_member", schoolId: 42, linkedSchoolIds: [] })).toEqual({ ok: false, code: "invalid_input" });
  });
});
