import { normalizeName } from "@/features/schools/normalize";
import type {
  ApplyRow,
  BatchInfo,
  BatchStatus,
  ClaimInput,
  ClaimResult,
  ErrorRow,
  RowAction,
  RowError,
  SchoolCounts,
  SchoolsImportRepository,
  Totals,
} from "@/features/schools/ports";

type School = { inep: string; name: string; normalized: string; ibge: string; network: string; verification: string; isDemo: boolean };
type MemRow = { action: RowAction; inep: string | null; errors: RowError[]; raw: Record<string, string>; unchanged: boolean };
type Batch = { id: string; hash: string; status: BatchStatus; isDemo: boolean; stale: boolean; rows: Map<number, MemRow> };

/**
 * Repositório em memória que aproxima `import_apply_rows`/`import_claim_batch` só para testar a orquestração do
 * serviço. O BANCO é a fonte das regras (demo x real, escolas travadas, avisos, concorrência real): elas são
 * verificadas em tests/db/imports.test.ts e tests/schools/repository.test.ts, não aqui.
 */
export class MemoryRepo implements SchoolsImportRepository {
  schools = new Map<string, School>();
  batches = new Map<string, Batch>();
  enabled = new Set<string>(["5103403"]);
  applyCalls = 0;
  applySizes: number[] = [];
  failOnApplyCall: number | null = null;
  claims = 0;

  seedSchool(s: Partial<School> & { inep: string; name: string }): void {
    this.schools.set(s.inep, {
      normalized: normalizeName(s.name),
      ibge: "5103403",
      network: "municipal",
      verification: "registered",
      isDemo: false,
      ...s,
    });
  }

  async claimBatch(input: ClaimInput): Promise<ClaimResult> {
    this.claims += 1;
    for (const b of this.batches.values()) {
      if (b.hash !== input.fileHash) continue;
      const claimable = b.status === "pending" || b.status === "failed" || (b.status === "processing" && b.stale);
      const owner = claimable && b.isDemo === input.isDemo;
      if (owner) {
        b.status = "processing";
        b.stale = false;
      }
      return { batchId: b.id, alreadyExisted: true, status: b.status, owner, isDemo: b.isDemo };
    }
    const id = `batch-${this.batches.size + 1}`;
    this.batches.set(id, { id, hash: input.fileHash, status: "processing", isDemo: input.isDemo, stale: false, rows: new Map() });
    return { batchId: id, alreadyExisted: false, status: "processing", owner: true, isDemo: input.isDemo };
  }

  private totalsOf(b: Batch, only?: number[]): Totals {
    const t: Totals = { inserted: 0, updated: 0, duplicate: 0, rejected: 0, unchanged: 0 };
    for (const [n, r] of b.rows) {
      if (only && !only.includes(n)) continue;
      if (r.unchanged) t.unchanged += 1;
      else t[r.action] += 1;
    }
    return t;
  }

  async getBatch(batchId: string): Promise<BatchInfo | null> {
    const b = this.batches.get(batchId);
    if (!b) return null;
    const t = this.totalsOf(b);
    return { batchId, status: b.status, isDemo: b.isDemo, totals: { ...t, total: b.rows.size } };
  }

  async applyRows(batchId: string, rows: ApplyRow[]): Promise<Totals> {
    this.applyCalls += 1;
    this.applySizes.push(rows.length);
    if (this.failOnApplyCall === this.applyCalls) throw new Error("falha simulada no lote");
    const b = this.batches.get(batchId);
    if (!b) throw new Error("lote não encontrado");
    b.status = "processing";
    for (const r of rows) {
      if (b.rows.has(r.row_number)) continue;
      let errors = r.errors ?? [];
      let action: RowAction | null = null;
      let unchanged = false;
      const norm = r.normalized_name ?? normalizeName(r.name ?? "");
      if (errors.length > 0) action = "rejected";
      else if (!r.ibge_code || !this.enabled.has(r.ibge_code)) {
        action = "rejected";
        errors = [{ code: "municipality_not_enabled", message: "Município não habilitado" }];
      } else if ([...b.rows.values()].some((x) => x.inep === r.inep && x.action !== "rejected")) {
        action = "duplicate";
        errors = [{ code: "duplicate_inep_in_file", message: "INEP repetido" }];
      } else {
        const ex = r.inep ? this.schools.get(r.inep) : undefined;
        const next = { inep: r.inep ?? "", name: r.name ?? "", normalized: norm, ibge: r.ibge_code, network: r.network ?? "", verification: ex?.verification ?? "registered", isDemo: b.isDemo };
        if (ex) {
          if (ex.name === next.name && ex.normalized === next.normalized && ex.network === next.network) {
            action = "duplicate";
            unchanged = true;
            errors = [{ code: "already_up_to_date", message: "igual" }];
          } else {
            this.schools.set(ex.inep, next);
            action = "updated";
          }
        } else if ([...this.schools.values()].some((s) => s.ibge === r.ibge_code && s.normalized === norm && s.isDemo === b.isDemo)) {
          action = "duplicate";
          errors = [{ code: "duplicate_name_municipality", message: "nome repetido" }];
        } else {
          this.schools.set(next.inep, next);
          action = "inserted";
        }
      }
      b.rows.set(r.row_number, { action, inep: r.inep, errors, raw: r.raw, unchanged });
    }
    return this.totalsOf(b, rows.map((r) => r.row_number));
  }

  async finishBatch(batchId: string, status: "completed" | "failed"): Promise<void> {
    const b = this.batches.get(batchId);
    if (b && b.status !== "completed") b.status = status;
  }

  async getErrorRows(batchId: string): Promise<ErrorRow[]> {
    const b = this.batches.get(batchId);
    if (!b) return [];
    return [...b.rows.entries()]
      .filter(([, r]) => r.action === "rejected" || (r.action === "duplicate" && !r.unchanged))
      .map(([n, r]) => ({ rowNumber: n, action: r.action as "duplicate" | "rejected", errors: r.errors, raw: r.raw }));
  }

  async countWarningRows(batchId: string): Promise<number> {
    const b = this.batches.get(batchId);
    return b ? [...b.rows.values()].filter((r) => r.errors.some((e) => e.code.startsWith("municipality_change"))).length : 0;
  }

  async countSchools(): Promise<SchoolCounts> {
    const all = [...this.schools.values()];
    return { real: all.filter((s) => !s.isDemo).length, demo: all.filter((s) => s.isDemo).length };
  }
}
