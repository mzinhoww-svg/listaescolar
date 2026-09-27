import "server-only";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import { ReportError } from "./errors";
import type { CreateReportInput, ReportQueueFilter, ReportView, ResolveReportInput } from "./ports";
import type { ReportsRepository } from "./repository";

function requireActor(actor: unknown): asserts actor is SessionActor {
  if (!isSessionActor(actor)) throw new ReportError("ator não vem da sessão", "forbidden");
}

/** Admin ou system administram a fila; qualquer papel autenticado pode denunciar. */
function requireAdmin(actor: SessionActor): void {
  if (actor.role !== "admin" && actor.role !== "system") throw new ReportError("só a equipe administra denúncias", "forbidden");
}

export class ReportsService {
  constructor(private readonly deps: { store: ReportsRepository }) {}

  /** Qualquer usuário autenticado denuncia (reporterId sempre da sessão, nunca do formulário). */
  async submit(actor: SessionActor, input: CreateReportInput): Promise<string> {
    requireActor(actor);
    return this.deps.store.create({ ...input, reporterId: actor.userId });
  }

  async listQueue(actor: SessionActor, filter: ReportQueueFilter = {}): Promise<ReportView[]> {
    requireActor(actor);
    requireAdmin(actor);
    return this.deps.store.listQueue(filter);
  }

  async getById(actor: SessionActor, id: string): Promise<ReportView | null> {
    requireActor(actor);
    requireAdmin(actor);
    return this.deps.store.getById(id);
  }

  async resolve(actor: SessionActor, input: ResolveReportInput): Promise<void> {
    requireActor(actor);
    requireAdmin(actor);
    await this.deps.store.resolve({ ...input, resolvedBy: actor.userId });
  }
}
