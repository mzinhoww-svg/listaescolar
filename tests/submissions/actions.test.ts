import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (p: string) => requireAccess(p) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const submitList = vi.fn();
vi.mock("@/features/submissions/service", async (orig) => ({
  ...(await orig<typeof import("@/features/submissions/service")>()),
  submitList: (...a: unknown[]) => submitList(...a),
}));
vi.mock("@/features/submissions/deps", () => ({ buildSubmitDeps: () => ({}) }));
const actorRole = { current: "parent" };
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => ({ userId: "u-sessao", role: actorRole.current }) }));
const linked = vi.fn();
vi.mock("@/features/claims/queries-mine", () => ({ listMySchools: (...a: unknown[]) => linked(...a) }));
const publicSchool = { visible: true };
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: publicSchool.visible ? { id: "x" } : null, error: null }) }) }) }) }),
}));

import { submitListAction } from "@/app/enviar-lista/actions";
import { SubmissionError } from "@/features/submissions/service";

const SCHOOL = "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b11";
const idle = { status: "idle" } as const;

function form(over: Record<string, string | File | null> = {}) {
  const fd = new FormData();
  const base: Record<string, string | File | null> = {
    consent: "on",
    grade: "5º ano",
    schoolYear: "2027",
    file: new File([new Uint8Array([37, 80, 68, 70, 45])], "lista.pdf", { type: "application/pdf" }),
    ...over,
  };
  for (const [k, v] of Object.entries(base)) if (v !== null) fd.set(k, v);
  return fd;
}

describe("submitListAction", () => {
  beforeEach(() => {
    requireAccess.mockReset();
    requireAccess.mockResolvedValue({ user: { id: "u-sessao" }, role: "parent" });
    actorRole.current = "parent";
    publicSchool.visible = true;
    linked.mockReset();
    linked.mockResolvedValue([]);
    submitList.mockReset();
  });

  it("exige sessão e papel de /enviar-lista antes de tudo", async () => {
    requireAccess.mockRejectedValue(new Error("REDIRECT:/entrar?next=%2Fenviar-lista"));
    await expect(submitListAction(idle, form())).rejects.toThrow("REDIRECT:/entrar");
    expect(requireAccess).toHaveBeenCalledWith("/enviar-lista");
    expect(submitList).not.toHaveBeenCalled();
  });

  it("sem consentimento: erro e nada é gravado", async () => {
    const r = await submitListAction(idle, form({ consent: null }));
    expect(r).toMatchObject({ status: "error", code: "consent_required" });
    expect(submitList).not.toHaveBeenCalled();
  });

  it("arquivo vazio e sem arquivo: recusados antes de ler o conteúdo", async () => {
    const empty = new File([], "vazio.pdf", { type: "application/pdf" });
    expect(await submitListAction(idle, form({ file: empty }))).toMatchObject({ code: "empty_file" });
    expect(await submitListAction(idle, form({ file: null }))).toMatchObject({ code: "no_file" });
    expect(submitList).not.toHaveBeenCalled();
  });

  it("campo de foto vazio (File de 0 bytes chamado blob) não esconde o arquivo da galeria", async () => {
    submitList.mockResolvedValue({ status: "review_needed", submissionId: "s-blob", result: {} });
    const fd = form({ file: null });
    fd.append("file", new File([], "blob"));
    fd.append("file", new File([new Uint8Array([37, 80, 68, 70, 45])], "lista.pdf", { type: "application/pdf" }));
    await expect(submitListAction(idle, fd)).rejects.toThrow(); // redirect
    expect(submitList).toHaveBeenCalledOnce();
  });

  it("acima de 4 MB: recusa pelo tamanho sem ler os bytes", async () => {
    const big = new File([new Uint8Array(1)], "grande.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    const arrayBuffer = vi.spyOn(big, "arrayBuffer");
    expect(await submitListAction(idle, form({ file: big }))).toMatchObject({ code: "file_too_large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("dono vem da sessão, nunca do formulário; sucesso redireciona ao painel", async () => {
    submitList.mockResolvedValue({ status: "processing_async", submissionId: "sub-1", jobId: "j", pipelineAvailable: true });
    await expect(submitListAction(idle, form({ profileId: "u-forjado" }))).rejects.toThrow("REDIRECT:/enviar-lista/sub-1");
    const input = submitList.mock.calls[0]![0];
    expect(input).toMatchObject({ profileId: "u-sessao", source: "parent", consent: true, grade: "5º ano", schoolYear: 2027 });
    expect(input.file.name).toBe("lista.pdf");
  });

  it("falha do pipeline também leva ao painel (que mostra o erro)", async () => {
    submitList.mockResolvedValue({ status: "failed", submissionId: "sub-2", reason: "extraction_failed" });
    await expect(submitListAction(idle, form())).rejects.toThrow("REDIRECT:/enviar-lista/sub-2");
  });

  it("erro de validação do serviço vira mensagem em português", async () => {
    submitList.mockRejectedValue(new SubmissionError("signature_mismatch"));
    expect(await submitListAction(idle, form())).toMatchObject({ status: "error", code: "signature_mismatch" });
  });

  it("erro inesperado não vaza detalhe", async () => {
    submitList.mockRejectedValue(new Error("connection string postgres://segredo"));
    const r = await submitListAction(idle, form());
    expect(r).toMatchObject({ status: "error", code: "unexpected" });
    expect(JSON.stringify(r)).not.toContain("segredo");
  });

  it("família escolhe qualquer escola pública: segue como envio de família, com a escola", async () => {
    submitList.mockResolvedValue({ status: "review_needed", submissionId: "s2", result: {} });
    await expect(submitListAction(idle, form({ schoolId: SCHOOL }))).rejects.toThrow("REDIRECT:/enviar-lista/s2");
    expect(submitList.mock.calls[0]![0]).toMatchObject({ source: "parent", schoolId: SCHOOL });
    expect(linked).not.toHaveBeenCalled();
  });

  it("família com escola que o público não vê (inexistente ou município desabilitado): invalid_input", async () => {
    publicSchool.visible = false;
    expect(await submitListAction(idle, form({ schoolId: SCHOOL }))).toMatchObject({ code: "invalid_input" });
    expect(submitList).not.toHaveBeenCalled();
  });

  it("D-002: school_member só envia por escola VINCULADA; sem vínculo: school_not_linked e nada é gravado", async () => {
    requireAccess.mockResolvedValue({ user: { id: "u2" }, role: "school_member" });
    actorRole.current = "school_member";
    linked.mockResolvedValue([{ schoolId: "5b1d4c2e-7d1a-4f0e-9a52-0c3f5e9a1b99" }]);
    expect(await submitListAction(idle, form({ schoolId: SCHOOL }))).toMatchObject({ code: "school_not_linked" });
    expect(submitList).not.toHaveBeenCalled();
    linked.mockResolvedValue([{ schoolId: SCHOOL }]);
    submitList.mockResolvedValue({ status: "review_needed", submissionId: "s3", result: {} });
    await expect(submitListAction(idle, form({ schoolId: SCHOOL }))).rejects.toThrow("REDIRECT:/enviar-lista/s3");
    expect(submitList.mock.calls[0]![0]).toMatchObject({ source: "school", schoolId: SCHOOL });
  });

  it("recusa do banco (school_not_linked) chega como a mensagem do vínculo", async () => {
    submitList.mockRejectedValue(new SubmissionError("school_not_linked"));
    expect(await submitListAction(idle, form())).toMatchObject({ code: "school_not_linked" });
  });
});
