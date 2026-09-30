import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { describeSubmission } from "@/features/submissions/list-model";
import { listMySubmissions } from "@/features/submissions/my-submissions";

describe("describeSubmission (estado do envio para a família)", () => {
  it.each([
    ["submitted", "Recebido"],
    ["processing", "Lendo a lista"],
    ["processing_async", "Lendo a lista"],
    ["review_needed", "Lista lida"],
    ["human_review", "Em revisão pela equipe"],
    ["approved", "Aprovada, publicando"],
    ["published", "Lista publicada"],
    ["rejected", "Não publicada"],
    ["archived", "Arquivado"],
  ])("%s vira %s", (status, label) => {
    expect(describeSubmission(status).label).toBe(label);
  });

  it("estado desconhecido nunca vira texto inventado: 'Andamento indisponível'", () => {
    expect(describeSubmission("qualquer-coisa").label).toBe("Andamento indisponível");
  });
});

function fakeClient(rows: unknown[], schools: unknown[]) {
  const calls: { table: string; eq: [string, unknown][] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, eq: [] as [string, unknown][] };
      calls.push(call);
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => (call.eq.push([c, v]), chain),
        in: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: table === "schools" ? schools : rows, error: null }),
        then: undefined as unknown,
      };
      // `schools` não tem limit: o `in` devolve a promessa.
      if (table === "schools") chain.in = () => Promise.resolve({ data: schools, error: null }) as never;
      return chain;
    },
  };
  return { client, calls };
}

describe("listMySubmissions", () => {
  it("consulta só os envios do dono (owner-scoped) e junta o nome da escola", async () => {
    const { client, calls } = fakeClient(
      [{ id: "10000000-0000-4000-8000-0000000000a1", status: "human_review", grade: "5º ano", school_year: 2027, school_id: "10000000-0000-4000-8000-0000000000b1", created_at: "2026-09-29T10:00:00Z", is_demo: false }],
      [{ id: "10000000-0000-4000-8000-0000000000b1", name: "Escola Modelo" }],
    );
    const out = await listMySubmissions(client as never, "u1");
    expect(calls[0]).toMatchObject({ table: "list_submissions", eq: [["submitted_by", "u1"]] });
    expect(out).toEqual([
      { id: "10000000-0000-4000-8000-0000000000a1", status: "human_review", grade: "5º ano", schoolYear: 2027, schoolName: "Escola Modelo", createdAt: "2026-09-29T10:00:00Z", isDemo: false },
    ]);
  });

  it("sem escola escolhida, o nome fica nulo (a tela diz 'Escola não informada')", async () => {
    const { client } = fakeClient([{ id: "10000000-0000-4000-8000-0000000000a2", status: "submitted", grade: null, school_year: null, school_id: null, created_at: "2026-09-29T10:00:00Z", is_demo: true }], []);
    const [only] = await listMySubmissions(client as never, "u1");
    expect(only).toMatchObject({ schoolName: null, grade: null, isDemo: true });
  });
});
