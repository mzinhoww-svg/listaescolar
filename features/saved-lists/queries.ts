import "server-only";

import type { SessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

import { listSavedLists, type SavedListRow } from "./repository";

export type { SavedListRow } from "./repository";

export async function listMySavedLists(actor: SessionActor): Promise<SavedListRow[]> {
  return listSavedLists(await createClient(), actor.userId);
}
