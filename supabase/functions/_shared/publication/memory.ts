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

/** Publicador em memória: idempotente por `idempotencyKey`, versão anterior = a publicada antes na mesma lista. */
export class MemoryListPublisher implements ListPublisher {
  readonly calls: PublishRequest[] = [];
  private readonly lists = new Map<string, MemList>();
  private readonly done = new Map<string, PublishResult>();
  private counter = 0;

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}0000000-0000-4000-8000-${String(this.counter).padStart(12, "0")}`;
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    this.calls.push(req);
    const again = this.done.get(req.idempotencyKey);
    if (again) return again;
    if (req.items.length === 0) throw new PortError("no_items", false);
    const key = keyOf(req);
    let list = this.lists.get(key);
    if (list?.status === "archived") throw new PortError("list_archived", false);
    if (!list) {
      list = { listId: this.nextId("3"), status: "published", versions: [] };
      this.lists.set(key, list);
    }
    const previousVersionId = list.versions.at(-1) ?? null;
    const newVersionId = this.nextId("4");
    list.versions.push(newVersionId);
    const out: PublishResult = { listId: list.listId, previousVersionId, newVersionId };
    this.done.set(req.idempotencyKey, out);
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
