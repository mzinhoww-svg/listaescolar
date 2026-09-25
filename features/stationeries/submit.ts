import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { transition } from "./repository";
import { PATH_TO_REVIEW } from "./submit-rules";
import type { StationeryStatus } from "./state";


export async function submitForReview(
  client: SupabaseClient,
  input: { id: string; from: StationeryStatus; actorId: string },
): Promise<StationeryStatus> {
  const steps = PATH_TO_REVIEW[input.from] ?? [];
  let current = input.from;
  for (const to of steps) {
    current = await transition(client, { id: input.id, to, actorId: input.actorId, actorRole: "owner" });
  }
  return current;
}
