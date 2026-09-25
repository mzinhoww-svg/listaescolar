import { normalizeName } from "@/features/schools/normalize";
import type {
  ApplyRow,
  BatchInfo,
  BatchStatus,
  BatchTotals,
  ClaimInput,
  ClaimResult,
  ErrorRow,
  RowAction,
  RowError,
  SchoolsImportRepository,
  Totals,
} from "@/features/schools/ports";

type School = { inep: string; name: string; normalized: string; ibge: string; network: string; verification: string };
type Batch = { id: string; hash: string; status: BatchStatus; isDemo: boolean; rows: Map<number, { action: RowAction; inep: string | null; errors: RowError[]; raw: Record<string, string> }> };

/** Repositório em memória que replica as regras de `import_apply_rows` para testar o serviço. */
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
      ...s,
    });
  }

  async claimBatch(input: ClaimInput): Promise<ClaimResult> {
    this.claims += 1;
    for (const b of this.batches.values()) {
      if (b.hash === input.fileHash) return { batchId: b.id, alreadyExisted: true, status: b.status };
    }
    const id = `batch-${this.batches.size + 1}`;
    this.batches.set(id, { id, hash: input.fileHash, status: "pending", isDemo: input.isDemo, rows: new Map() });
    return { batchId: id, alreadyExisted: false, status: "pending" };
  }

  private totalsOf(b: Batch, only?: number[]): Totals {
    const t: Totals = { inserted: 0, updated: 0, duplicate: 0, rejected: 0, unchanged: 0 };
    for (const [n, r] of b.rows) {
      if (only && !only.includes(n)) continue;
      if (r.action === "duplicate" && r.errors.some((e) => e.code === "already_up_to_date")) t.unchanged += 1;
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
    if (b.status === "pending" || b.status === "failed") b.status = "processing";
    for (const r of rows) {
      if (b.rows.has(r.row_number)) continue;
      let errors = r.errors ?? [];
      let action: RowAction | null = null;
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
        const next = { inep: r.inep ?? "", name: r.name ?? "", normalized: norm, ibge: r.ibge_code, network: r.network ?? "", verification: ex?.verification ?? "registered" };
        if (ex) {
          if (ex.name === next.name && ex.normalized === next.normalized && ex.network === next.network) {
            action = "duplicate";
            errors = [{ code: "already_up_to_date", message: "igual" }];
          } else {
            this.schools.set(ex.inep, next);
            action = "updated";
          }
        } else if ([...this.schools.values()].some((s) => s.ibge === r.ibge_code && s.normalized === norm)) {
          action = "duplicate";
          errors = [{ code: "duplicate_name_municipality", message: "nome repetido" }];
        } else {
          this.schools.set(next.inep, next);
          action = "inserted";
        }
      }
      b.rows.set(r.row_number, { action, inep: r.inep, errors, raw: r.raw });
    }
    return this.totalsOf(b, rows.map((r) => r.row_number));
  }

  async finishBatch(batchId: string, _totals: BatchTotals, status: "completed" | "failed"): Promise<void> {
    const b = this.batches.get(batchId);
    if (b) b.status = status;
  }

  async getErrorRows(batchId: string): Promise<ErrorRow[]> {
    const b = this.batches.get(batchId);
    if (!b) return [];
    return [...b.rows.entries()]
      .filter(([, r]) => r.action === "rejected" || (r.action === "duplicate" && !r.errors.some((e) => e.code === "already_up_to_date")))
      .map(([n, r]) => ({ rowNumber: n, action: r.action as "duplicate" | "rejected", errors: r.errors, raw: r.raw }));
  }

  async countSchools(): Promise<number> {
    return this.schools.size;
  }
}
