// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import iconv from "iconv-lite";
import { beforeEach, describe, expect, it } from "vitest";
import { importInepFile } from "@/features/schools/import-service";
import { MemoryRepo } from "./memory-repo";

const HEADER = "CO_ENTIDADE;NO_ENTIDADE;CO_MUNICIPIO;TP_DEPENDENCIA";
const csv = (...lines: string[]) => Buffer.from([HEADER, ...lines].join("\n") + "\n", "utf8");
const input = (buffer: Buffer, isDemo = false) => ({ fileName: "t.csv", buffer, importedBy: null, isDemo });

let repo: MemoryRepo;
beforeEach(() => {
  repo = new MemoryRepo();
});

describe("importInepFile", () => {
  it("insere escolas novas e completa o lote", async () => {
    const r = await importInepFile(input(csv("51000001;Escola A;5103403;3", "51000002;Escola B;5103403;2")), { repo });
    expect(r).toMatchObject({ alreadyExisted: false, status: "completed", fileErrors: [] });
    expect(r.totals).toEqual({ total: 2, inserted: 2, updated: 0, duplicate: 0, rejected: 0, unchanged: 0 });
    expect(await repo.countSchools()).toBe(2);
  });

  it("calcula o hash SHA-256 do buffer bruto e o repassa ao claim", async () => {
    const buffer = csv("51000001;Escola A;5103403;3");
    await importInepFile(input(buffer), { repo });
    expect([...repo.batches.values()][0]?.hash).toBe(createHash("sha256").update(buffer).digest("hex"));
  });

  it("escola já igual ao arquivo conta como unchanged, não duplicate, e fica fora de getErrorRows", async () => {
    repo.seedSchool({ inep: "51000001", name: "Escola Um", verification: "registered" });
    const r = await importInepFile(input(csv("51000001;Escola Um;5103403;3")), { repo });
    expect(r.totals).toEqual({ total: 1, inserted: 0, updated: 0, duplicate: 0, rejected: 0, unchanged: 1 });
    expect(await repo.getErrorRows(r.batchId)).toEqual([]);
  });

  it("atualiza escola existente sem mudar verification_status", async () => {
    repo.seedSchool({ inep: "51000001", name: "Nome Antigo", verification: "verified" });
    const r = await importInepFile(input(csv("51000001;Nome Novo;5103403;3")), { repo });
    expect(r.totals.updated).toBe(1);
    expect(repo.schools.get("51000001")).toMatchObject({ name: "Nome Novo", verification: "verified" });
  });

  it("classifica duplicidade no arquivo e por nome+município", async () => {
    repo.seedSchool({ inep: "51000009", name: "Escola Existente" });
    const r = await importInepFile(
      input(csv("51000001;Escola A;5103403;3", "51000001;Escola A;5103403;3", "51000002;ESCOLA EXISTENTE;5103403;3")),
      { repo },
    );
    expect(r.totals).toEqual({ total: 3, inserted: 1, updated: 0, duplicate: 2, rejected: 0, unchanged: 0 });
    const errs = await repo.getErrorRows(r.batchId);
    expect(errs.flatMap((e) => e.errors.map((x) => x.code)).sort()).toEqual(["duplicate_inep_in_file", "duplicate_name_municipality"]);
  });

  it("rejeita município não habilitado, INEP inválido e rede inválida (com erros gravados)", async () => {
    const r = await importInepFile(
      input(csv("51000001;A;5208707;3", "12;B;5103403;3", "51000003;C;5103403;8", "51000004;;5103403;3")),
      { repo },
    );
    expect(r.totals).toMatchObject({ total: 4, inserted: 0, rejected: 4 });
    const codes = (await repo.getErrorRows(r.batchId)).map((e) => e.errors[0]?.code);
    expect(codes).toEqual(["municipality_not_enabled", "invalid_inep", "invalid_network", "invalid_name"]);
    expect(await repo.countSchools()).toBe(0);
  });

  it("arquivo sem coluna obrigatória: failed, sem tocar em escolas nem aplicar linhas", async () => {
    repo.seedSchool({ inep: "51000001", name: "Existente" });
    const r = await importInepFile(input(Buffer.from("CO_ENTIDADE;NO_ENTIDADE\n51000002;X\n")), { repo });
    expect(r.status).toBe("failed");
    expect(r.fileErrors.map((e) => e.code)).toEqual(["missing_column", "missing_column"]);
    expect(repo.applyCalls).toBe(0);
    expect(repo.schools.size).toBe(1);
  });

  it("mesmo hash: devolve o lote existente sem reprocessar", async () => {
    const buffer = csv("51000001;Escola A;5103403;3");
    const first = await importInepFile(input(buffer), { repo });
    const calls = repo.applyCalls;
    const second = await importInepFile(input(buffer), { repo });
    expect(second).toMatchObject({ batchId: first.batchId, alreadyExisted: true, status: "completed" });
    expect(second.totals).toEqual(first.totals);
    expect(repo.applyCalls).toBe(calls);
    expect(repo.batches.size).toBe(1);
  });

  it("arquivo novo com INEPs já existentes atualiza sem duplicar", async () => {
    await importInepFile(input(csv("51000001;Escola A;5103403;3")), { repo });
    const r = await importInepFile(input(csv("51000001;Escola A Renomeada;5103403;3")), { repo });
    expect(r.alreadyExisted).toBe(false);
    expect(r.totals.updated).toBe(1);
    expect(await repo.countSchools()).toBe(1);
  });

  it("chunkSize pequeno percorre todos os lotes", async () => {
    const lines = Array.from({ length: 7 }, (_, i) => `5100000${i + 1};Escola ${i + 1};5103403;3`);
    const r = await importInepFile(input(csv(...lines)), { repo, chunkSize: 3 });
    expect(repo.applySizes).toEqual([3, 3, 1]);
    expect(r.totals).toMatchObject({ total: 7, inserted: 7 });
  });

  it("falha no meio: failed com totais parciais; reprocessar completa sem duplicar", async () => {
    const lines = Array.from({ length: 7 }, (_, i) => `5100000${i + 1};Escola ${i + 1};5103403;3`);
    const buffer = csv(...lines);
    repo.failOnApplyCall = 2;
    const failed = await importInepFile(input(buffer), { repo, chunkSize: 3 });
    expect(failed.status).toBe("failed");
    expect(failed.totals).toMatchObject({ total: 3, inserted: 3 });
    expect(failed.fileErrors[0]?.code).toBe("processing_failed");
    expect(repo.batches.get(failed.batchId)?.status).toBe("failed");

    repo.failOnApplyCall = null;
    const again = await importInepFile(input(buffer), { repo, chunkSize: 3 });
    expect(again).toMatchObject({ batchId: failed.batchId, alreadyExisted: true, status: "completed" });
    expect(again.totals).toEqual({ total: 7, inserted: 7, updated: 0, duplicate: 0, rejected: 0, unchanged: 0 });
    expect(await repo.countSchools()).toBe(7);
    expect(repo.batches.size).toBe(1);
  });

  it("lote em processamento por outro upload não é reprocessado", async () => {
    const buffer = csv("51000001;Escola A;5103403;3");
    const claim = await repo.claimBatch({
      fileHash: createHash("sha256").update(buffer).digest("hex"),
      fileName: "t.csv",
      importedBy: null,
      isDemo: false,
    });
    const b = repo.batches.get(claim.batchId);
    if (b) b.status = "processing";
    const r = await importInepFile(input(buffer), { repo });
    expect(r).toMatchObject({ alreadyExisted: true, status: "processing" });
    expect(repo.applyCalls).toBe(0);
  });

  it("reimportar dados idênticos não gera linhas de erro (already_up_to_date não é erro)", async () => {
    await importInepFile(input(csv("51000001;Escola A;5103403;3")), { repo });
    const r = await importInepFile(input(csv("51000001;Escola A;5103403;3", "51000002;Outra;5103403;3")), { repo });
    expect(r.totals).toMatchObject({ unchanged: 1, inserted: 1 });
    expect(await repo.getErrorRows(r.batchId)).toEqual([]);
  });

  it("chunkSize é limitado a 500 e is_demo do lote vai em todas as linhas", async () => {
    const seen: boolean[] = [];
    const orig = repo.applyRows.bind(repo);
    repo.applyRows = async (id, rows) => {
      seen.push(...rows.map((x) => x.is_demo));
      return orig(id, rows);
    };
    const lines = Array.from({ length: 501 }, (_, i) => `${51100000 + i};Escola ${i};5103403;3`);
    await importInepFile(input(csv(...lines), true), { repo, chunkSize: 10_000 });
    expect(repo.applySizes).toEqual([500, 1]);
    expect(seen.every(Boolean)).toBe(true);
  });

  it("propaga is_demo às linhas e aceita hash injetado", async () => {
    const r = await importInepFile(input(csv("51000001;A;5103403;3"), true), { repo, hash: () => "fixed" });
    expect([...repo.batches.values()][0]?.hash).toBe("fixed");
    expect(r.status).toBe("completed");
  });

  it("latin1 e fixture demo: totais esperados", async () => {
    const utf8 = readFileSync("tests/fixtures/inep-demo.csv");
    const latin = iconv.encode(utf8.toString("utf8"), "latin1");
    const r = await importInepFile(input(latin, true), { repo });
    expect(r.totals).toEqual({ total: 8, inserted: 3, updated: 0, duplicate: 2, rejected: 3, unchanged: 0 });
    expect(repo.schools.get("51990001")?.name).toBe("Escola Demonstração 1");
  });
});
