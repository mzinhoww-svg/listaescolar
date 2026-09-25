// Implementações EM MEMÓRIA das portas da publicação (testes e E2E). Só a composição as liga, e só com
// FAKE_PUBLICATION_FIXTURE válido + APP_ENV explícito não produtivo. Nada aqui toca lists, versions ou schools.
import { z } from "zod";
import {
  PortError,
  type ContextQuery,
  type ListPublisher,
  type PublicationContextReader,
  type PublishRequest,
  type PublishResult,
} from "./ports.ts";
import type { PublicationContext } from "./types.ts";

const uuid = z.string().uuid();
export const publicationFixtureSchema = z
  .object({
    schools: z
      .array(
        z
          .object({
            id: uuid,
            verification: z.enum(["registered", "claimed", "verified", "suspended"]),
            municipalityEnabled: z.boolean(),
            linkedProfiles: z.array(uuid).max(200),
          })
          .strict(),
      )
      .max(200),
    /** Rótulo da série (como o formulário envia) -> slug do catálogo. */
    grades: z.record(z.string().min(1).max(60), z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)),
    validSchoolYears: z.array(z.number().int().min(2000).max(2100)).max(10),
  })
  .strict();
export type PublicationFixture = z.infer<typeof publicationFixtureSchema>;

/** Fixture inválida, ausente ou com JSON quebrado = `null` (as portas ficam nulas). */
export function parsePublicationFixture(raw: string | undefined): PublicationFixture | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = publicationFixtureSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type ListKey = { schoolId: string; gradeSlug: string; schoolYear: number };
const keyOf = (k: ListKey): string => `${k.schoolId}|${k.gradeSlug}|${k.schoolYear}`;

type MemList = { listId: string; status: "published" | "archived"; versions: string[] };

type Fingerprint = string;
const fingerprint = (r: PublishRequest): Fingerprint => JSON.stringify([r.schoolId, r.gradeSlug, r.schoolYear, r.items]);

/**
 * Publicador em memória: idempotente por `idempotencyKey` (mesma chave com outro payload = erro permanente),
 * versão anterior = a publicada antes na mesma lista, ids aleatórios. Só vale dentro de UM processo: app (Next) e
 * worker (Edge Function) são processos distintos e NÃO compartilham este estado; é aparato de teste/E2E local.
 */
export class MemoryListPublisher implements ListPublisher {
  readonly calls: PublishRequest[] = [];
  private readonly lists = new Map<string, MemList>();
  private readonly done = new Map<string, { fp: Fingerprint; out: PublishResult }>();
  private nextError: PortError | null = null;

  /** Gancho de teste da suíte de contrato: a PRÓXIMA chamada falha com este erro (uma vez). */
  failNext(e: PortError): void {
    this.nextError = e;
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    this.calls.push(req);
    if (this.nextError) {
      const e = this.nextError;
      this.nextError = null;
      throw e;
    }
    if (req.signal?.aborted) throw new PortError("publish_aborted", true);
    const again = this.done.get(req.idempotencyKey);
    if (again) {
      if (again.fp !== fingerprint(req)) throw new PortError("idempotency_conflict", false);
      return again.out;
    }
    if (req.items.length === 0) throw new PortError("no_items", false);
    const key = keyOf(req);
    let list = this.lists.get(key);
    if (list?.status === "archived") throw new PortError("list_archived", false);
    if (!list) {
      list = { listId: crypto.randomUUID(), status: "published", versions: [] };
      this.lists.set(key, list);
    }
    const previousVersionId = list.versions.at(-1) ?? null;
    const newVersionId = crypto.randomUUID();
    list.versions.push(newVersionId);
    const out: PublishResult = { listId: list.listId, previousVersionId, newVersionId };
    this.done.set(req.idempotencyKey, { fp: fingerprint(req), out });
    return out;
  }

  /** Gancho de teste da suíte de contrato. */
  archive(target: ListKey): void {
    const list = this.lists.get(keyOf(target));
    if (list) list.status = "archived";
  }

  /** Estado da lista-alvo, para o leitor de contexto em memória. */
  currentList(target: ListKey): PublicationContext["currentList"] {
    const list = this.lists.get(keyOf(target));
    return list ? { listId: list.listId, status: list.status, currentVersionId: list.versions.at(-1) ?? null } : null;
  }
}

/** Leitor de contexto em memória: escola, série, ano e vínculo vêm só da fixture; nunca adivinha verificação. */
export class MemoryPublicationContextReader implements PublicationContextReader {
  constructor(
    private readonly fixture: PublicationFixture,
    private readonly publisher?: MemoryListPublisher,
  ) {}

  async load(q: ContextQuery): Promise<PublicationContext> {
    const school = q.schoolId === null ? undefined : this.fixture.schools.find((s) => s.id === q.schoolId);
    const gradeSlug = q.grade === null ? null : (this.fixture.grades[q.grade] ?? null);
    return {
      school: school ? { verification: school.verification, municipalityEnabled: school.municipalityEnabled } : null,
      gradeSlug,
      validSchoolYears: [...this.fixture.validSchoolYears],
      submitterLinked: school ? school.linkedProfiles.includes(q.submittedBy) : false,
      currentList:
        school && gradeSlug && q.schoolYear !== null
          ? (this.publisher?.currentList({ schoolId: school.id, gradeSlug, schoolYear: q.schoolYear }) ?? null)
          : null,
    };
  }
}
