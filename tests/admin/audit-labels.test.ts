import { describe, expect, it } from "vitest";

import { actionLabel, actorLabel, describeChanges, tableLabel } from "@/features/admin/audit-labels";

describe("rótulos da trilha de auditoria (UX-108)", () => {
  it("ação e tabela em português, sem o valor cru", () => {
    expect(actionLabel("UPDATE")).toBe("Alterado");
    expect(actionLabel("INSERT")).toBe("Criado");
    expect(actionLabel("DELETE")).toBe("Removido");
    expect(tableLabel("school_lists")).toBe("Lista escolar");
    expect(tableLabel("stationeries")).toBe("Papelaria");
    expect(tableLabel("tabela_desconhecida")).toBe("tabela desconhecida");
  });

  it("ator: nome e papel da equipe; sem ator = automático", () => {
    expect(actorLabel({ actorId: "a", actorRole: "admin", actorName: "Ana" })).toEqual({ primary: "Ana", secondary: "Equipe" });
    expect(actorLabel({ actorId: "a", actorRole: "admin", actorName: null })).toEqual({ primary: "Equipe", secondary: "Nome indisponível" });
    expect(actorLabel({ actorId: null, actorRole: "system", actorName: null })).toEqual({ primary: "Sistema", secondary: "Ação automática" });
    expect(actorLabel({ actorId: null, actorRole: null, actorName: null })).toEqual({ primary: "Sistema", secondary: "Ação automática" });
    expect(actorLabel({ actorId: "u", actorRole: "parent", actorName: null }).primary).toBe("Família");
  });

  it("UPDATE lista só o que mudou, com rótulos e valores legíveis (sem JSON cru)", () => {
    const rows = describeChanges(
      "UPDATE",
      { id: "x", status: "under_review", updated_at: "t1", paused_by: null, is_demo: false },
      { id: "x", status: "approved", updated_at: "t2", paused_by: null, is_demo: true },
    );
    expect(rows).toEqual([
      { label: "Situação", before: "Em revisão", after: "Aprovada" },
      { label: "Dados demonstrativos", before: "Não", after: "Sim" },
    ]);
  });

  it("INSERT mostra os campos preenchidos; DELETE mostra os anteriores; objetos aninhados não viram JSON", () => {
    expect(describeChanges("INSERT", null, { id: "x", status: "draft", note: null, cfg: { a: 1 } })).toEqual([
      { label: "Situação", before: null, after: "Rascunho" },
      { label: "cfg", before: null, after: "conteúdo estruturado" },
    ]);
    expect(describeChanges("DELETE", { id: "x", status: "draft" }, null)).toEqual([{ label: "Situação", before: "Rascunho", after: null }]);
  });

  it("valor longo é resumido e nada aparece como {…}", () => {
    const [row] = describeChanges("UPDATE", { reason: "a".repeat(200) }, { reason: "b".repeat(200) });
    expect(row?.after?.length).toBeLessThanOrEqual(81);
    expect(row?.after).toMatch(/…$/);
  });
});
