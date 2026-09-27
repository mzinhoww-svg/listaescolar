import "server-only";

import type { SessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

import { getOwnedStudent, listStudents, type StudentRow } from "./repository";

export type { StudentRow } from "./repository";

export async function listMyStudents(actor: SessionActor): Promise<StudentRow[]> {
  return listStudents(await createClient(), actor.userId);
}

export async function getMyStudent(actor: SessionActor, id: string): Promise<StudentRow | null> {
  return getOwnedStudent(await createClient(), id);
}
