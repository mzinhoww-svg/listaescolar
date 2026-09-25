import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ actor: null as unknown }));
const copy = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => session.actor }));
vi.mock("@/features/review/deps", () => ({ buildParentCopyService: () => copy }));

import { saveParentCopyAction } from "@/app/enviar-lista/[submissionId]/revisar/actions";
import { PARENT_IDLE } from "@/app/enviar-lista/[submissionId]/revisar/state";
import { ReviewError } from "@/features/review/errors";

const COPY = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const PARENT = { userId: "aaaaaaaa-5d4a-4b6f-9c3d-1a2b3c4d5e6f", role: "parent" };
const item = { name: "Caderno", quantity: 2, unit: null, category: null, confidence: null, alerts: [], origin: "edited" };
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ok = (over: Record<string, unknown> = {}) => form({ copyId: COPY, payload: JSON.stringify({ items: [item], expectedVersion: 1, ...over }) });

beforeEach(() => {
  session.actor = PARENT;
  copy.save.mockReset();
});

describe("saveParentCopyAction", () => {
  it("sem sessão: erro fixo; papel diferente de parent (admin, school_member): erro sem chamar o serviço", async () => {
    session.actor = null;
    expect((await saveParentCopyAction(PARENT_IDLE, ok())).kind).toBe("error");
    for (const role of ["admin", "school_member", "stationery_member"]) {
      session.actor = { userId: PARENT.userId, role };
      expect((await saveParentCopyAction(PARENT_IDLE, ok())).kind).toBe("error");
    }
    expect(copy.save).not.toHaveBeenCalled();
  });
  it("Zod na fronteira: quantidade fracionária, chave extra, JSON quebrado e nome vazio nunca chegam ao serviço", async () => {
    for (const payload of [JSON.stringify({ items: [{ ...item, quantity: 1.5 }], expectedVersion: 1 }), JSON.stringify({ items: [{ ...item, actorId: "x" }], expectedVersion: 1 }), "{", JSON.stringify({ items: [{ ...item, name: "" }], expectedVersion: 1 })]) {
      expect((await saveParentCopyAction(PARENT_IDLE, form({ copyId: COPY, payload }))).kind).toBe("error");
    }
    expect(copy.save).not.toHaveBeenCalled();
  });
  it("salva com o ator da sessão (o dono é conferido no SQL) e devolve a nova versão", async () => {
    copy.save.mockResolvedValue("saved");
    const r = await saveParentCopyAction(PARENT_IDLE, ok({ expectedVersion: 4 }));
    expect(r).toEqual({ kind: "saved", message: "Lista salva.", version: 5 });
    expect(copy.save).toHaveBeenCalledWith(PARENT, COPY, { items: [item], expectedVersion: 4 });
  });
  it("stale: mensagem de outra aba; erros do serviço viram frase fixa (nada do Postgres)", async () => {
    copy.save.mockResolvedValueOnce("stale");
    expect(await saveParentCopyAction(PARENT_IDLE, ok())).toEqual({ kind: "stale", message: "Esta lista foi alterada em outra aba. Recarregue." });
    copy.save.mockRejectedValueOnce(new ReviewError("not_found"));
    expect((await saveParentCopyAction(PARENT_IDLE, ok())).message).toBe("Não foi possível salvar esta lista.");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    copy.save.mockRejectedValueOnce(new Error("relation parent_list_copies does not exist"));
    expect((await saveParentCopyAction(PARENT_IDLE, ok())).message).not.toMatch(/relation|parent_list_copies/);
  });
  it("a cópia nunca chega à fila, às versões, às decisões nem à porta: os arquivos do pai não tocam nada disso", () => {
    for (const f of ["app/enviar-lista/[submissionId]/revisar/actions.ts", "app/enviar-lista/[submissionId]/revisar/page.tsx", "components/review/ParentCopyEditor.tsx", "components/review/ParentItemRow.tsx"]) {
      const t = readFileSync(f, "utf8");
      expect(t, f).not.toMatch(/review_versions|ai_decisions|ai_record|review_(open|save|approve|reject)|buildReviewService|features\/publication|ListPublisher|publish|list_submissions|dangerouslySetInnerHTML/);
    }
  });
});
