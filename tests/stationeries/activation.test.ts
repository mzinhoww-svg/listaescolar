import { describe, expect, it } from "vitest";

import { computeActivation } from "@/features/stationeries/activation";

describe("computeActivation", () => {
  it("sem nada feito: 4 passos pendentes, próximo é o perfil", () => {
    const a = computeActivation({ hasProfile: false, areasCount: 0, catalogCount: 0, leadsReceived: 0 });
    expect(a.complete).toBe(false);
    expect(a.doneCount).toBe(0);
    expect(a.steps.map((s) => s.done)).toEqual([false, false, false, false]);
    expect(a.next?.id).toBe("profile");
  });

  it("parcial: perfil e bairros feitos, próximo é o catálogo", () => {
    const a = computeActivation({ hasProfile: true, areasCount: 3, catalogCount: 0, leadsReceived: 0 });
    expect(a.doneCount).toBe(2);
    expect(a.next?.id).toBe("catalog");
    expect(a.next?.href).toBe("/papelaria/catalogo");
  });

  it("completo: sem próximo passo", () => {
    const a = computeActivation({ hasProfile: true, areasCount: 1, catalogCount: 12, leadsReceived: 1 });
    expect(a.complete).toBe(true);
    expect(a.doneCount).toBe(4);
    expect(a.next).toBeNull();
  });

  it("contagens inválidas (negativa, NaN) contam como zero", () => {
    const a = computeActivation({ hasProfile: true, areasCount: -1, catalogCount: Number.NaN, leadsReceived: 0 });
    expect(a.steps.filter((s) => s.done).map((s) => s.id)).toEqual(["profile"]);
  });
});
