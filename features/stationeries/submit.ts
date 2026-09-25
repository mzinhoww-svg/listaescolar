import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionActor } from "./actor";
import { transition } from "./repository";
import { PATH_TO_REVIEW } from "./submit-rules";
import type { StationeryStatus } from "./state";

/** O dono (ator da sessão) leva o cadastro até `under_review`; cada passo passa pela função SQL. */
export async function submitForReview(
  client: SupabaseClient,
  actor: SessionActor,
  input: { id: string; from: StationeryStatus },
): Promise<StationeryStatus> {
  const steps = PATH_TO_REVIEW[input.from] ?? [];
  let current = input.from;
  for (const to of steps) {
    current = await transition(client, actor, { id: input.id, to, as: "owner" });
  }
  return current;
}
