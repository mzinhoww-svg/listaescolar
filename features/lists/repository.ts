import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

import { itemsInputSchema, type ItemInput } from "./schemas";
import { PUBLISH_ONLY_TARGET, assertTransition, type ListState } from "./state";

/**
 * Repositório de ESCRITA (service role). Os chamadores são as portas S09/S10/S11 (Pipeline/admin): toda
 * operação que muda estado exige `actorId` explícito (id do perfil que decidiu); nunca há ator implícito.
 * Nunca importar em código de cliente nem em consulta pública (use `queries.ts`).
 */
export type WriteClient = SupabaseClient;

export type ListRepositoryErrorCode =
  | "not_found"
  | "invalid_transition"
  | "invalid_argument"
  | "already_exists"
  | "database";

export class ListRepositoryError extends Error {
  constructor(
    readonly code: ListRepositoryErrorCode,
    message: string,
    readonly pgCode?: string,
  ) {
    super(message);
    this.name = "ListRepositoryError";
  }
}

function mapError(e: { code?: string; message: string }, what: string): ListRepositoryError {
  switch (e.code) {
    case "P0002":
      return new ListRepositoryError("not_found", `${what}: lista não encontrada`, e.code);
    case "23514":
      return new ListRepositoryError("invalid_transition", `${what}: estado não permite a operação`, e.code);
    case "22023":
      return new ListRepositoryError("invalid_argument", `${what}: argumento inválido`, e.code);
    case "23505":
      return new ListRepositoryError("already_exists", `${what}: já existe`, e.code);
    default:
      return new ListRepositoryError("database", `${what}: falha no banco (${e.code ?? "sem código"})`, e.code);
  }
}

const uuid = z.uuid();
const candidateRows = z.array(z.object({ version_id: z.uuid(), version_number: z.number().int().positive() }));
const draftRow = z.object({ id: z.uuid() });
const positionRow = z.object({ position: z.number().int().positive() });

export type DraftInput = { schoolId: string; gradeId: string; schoolYear: number; isDemo: boolean };
export type CandidateInput = {
  listId: string;
  source: "school_upload" | "parent_upload" | "admin";
  submissionId?: string | null;
  createdBy?: string | null;
};

export function createListsRepository(client: WriteClient) {
  return {
    /** Lista em `draft`. Uma lista por escola/série/ano: repetir dá `already_exists`. */
    async createDraftList(input: DraftInput): Promise<string> {
      const { data, error } = await client
        .from("school_lists")
        .insert({ school_id: input.schoolId, grade_id: input.gradeId, school_year: input.schoolYear, is_demo: input.isDemo })
        .select("id")
        .single();
      if (error) throw mapError(error, "createDraftList");
      return draftRow.parse(data).id;
    },

    /** Próxima versão candidata (não muda o estado da lista: uma publicada segue pública). */
    async createCandidateVersion(input: CandidateInput): Promise<{ versionId: string; versionNumber: number }> {
      const { data, error } = await client.rpc("list_create_candidate_version", {
        p_list_id: input.listId,
        p_source: input.source,
        p_submission_id: input.submissionId ?? null,
        p_created_by: input.createdBy ?? null,
      });
      if (error) throw mapError(error, "createCandidateVersion");
      const [row] = candidateRows.parse(data);
      if (!row) throw new ListRepositoryError("database", "createCandidateVersion: sem retorno");
      return { versionId: row.version_id, versionNumber: row.version_number };
    },

    /** Acrescenta itens (validados) ao fim de uma versão `candidate`; o banco recusa outras versões. */
    async addItems(versionId: string, items: ItemInput[]): Promise<number> {
      const parsed = itemsInputSchema.parse(items);
      const { data: last, error: le } = await client
        .from("list_items")
        .select("position")
        .eq("version_id", versionId)
        .order("position", { ascending: false })
        .limit(1);
      if (le) throw mapError(le, "addItems");
      const start = last && last[0] ? positionRow.parse(last[0]).position : 0;
      const rows = parsed.map((it, i) => ({
        version_id: versionId,
        position: start + i + 1,
        original_name: it.originalName,
        normalized_name: it.normalizedName,
        category: it.category,
        quantity: it.quantity,
        unit: it.unit,
        confidence: it.confidence,
        alerts: it.alerts,
      }));
      const { error } = await client.from("list_items").insert(rows);
      if (error) throw mapError(error, "addItems");
      return rows.length;
    },

    /**
     * Muda o estado (matriz TS antes do banco). `published` só por `publishVersion`; `archived` delega
     * a list_archive no banco. `approved`/`rejected` exigem ator (o banco também confere).
     */
    async transition(input: { listId: string; to: ListState; actorId: string; reason?: string | null }): Promise<void> {
      uuid.parse(input.actorId);
      if (input.to === PUBLISH_ONLY_TARGET) {
        throw new ListRepositoryError("invalid_argument", "transition: publicar exige publishVersion (versão explícita)");
      }
      const { data, error: ge } = await client.from("school_lists").select("status").eq("id", input.listId).maybeSingle();
      if (ge) throw mapError(ge, "transition");
      if (!data) throw new ListRepositoryError("not_found", "transition: lista não encontrada");
      assertTransition(z.object({ status: z.string() }).parse(data).status as ListState, input.to);
      const { error } = await client.rpc("list_transition", {
        p_list_id: input.listId,
        p_to: input.to,
        p_actor_id: input.actorId,
        p_reason: input.reason ?? null,
      });
      if (error) throw mapError(error, "transition");
    },

    /**
     * Aprova uma versão `candidate` da própria lista (grava quem e quando na versão). Só versão aprovada
     * publica: a aprovação da lista (`transition -> approved`) não basta.
     */
    async approveVersion(input: { listId: string; versionId: string; actorId: string }): Promise<void> {
      uuid.parse(input.actorId);
      const { error } = await client.rpc("list_approve_version", {
        p_list_id: input.listId,
        p_version_id: input.versionId,
        p_actor_id: input.actorId,
      });
      if (error) throw mapError(error, "approveVersion");
    },

    /**
     * Publica a versão candidata, que precisa estar aprovada (`approveVersion`) e ter itens; a lista precisa
     * estar `approved` ou `published`. A versão publicada anterior vira `superseded`. Sem aprovação ou sem
     * itens o banco responde 23514 (`invalid_transition`).
     */
    async publishVersion(input: { listId: string; versionId: string; actorId: string }): Promise<number> {
      uuid.parse(input.actorId);
      const { data, error } = await client.rpc("list_publish_version", {
        p_list_id: input.listId,
        p_version_id: input.versionId,
        p_actor_id: input.actorId,
      });
      if (error) throw mapError(error, "publishVersion");
      return z.number().int().parse(data);
    },

    /** published -> archived; todas as versões ficam arquivadas e a lista some da consulta pública. */
    async archive(input: { listId: string; actorId: string; reason?: string | null }): Promise<void> {
      uuid.parse(input.actorId);
      const { error } = await client.rpc("list_archive", {
        p_list_id: input.listId,
        p_actor_id: input.actorId,
        p_reason: input.reason ?? null,
      });
      if (error) throw mapError(error, "archive");
    },
  };
}

export type ListsRepository = ReturnType<typeof createListsRepository>;

export function createAdminListsRepository(): ListsRepository {
  return createListsRepository(createAdminClient());
}
