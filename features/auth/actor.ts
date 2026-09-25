import "server-only";

import type { UserRole } from "@/features/auth/access";
import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";

declare const sessionActorBrand: unique symbol;

/**
 * (Cópia de features/stationeries/actor.ts por ADR-004; a S11 unifica.) Quem está agindo, vindo SÓ da sessão validada no servidor (`getCurrentUser`) e do papel em `profiles`
 * (`getCurrentRole`). O tipo é de marca: nenhum objeto comum (nem input de formulário) serve como `SessionActor`,
 * e os métodos do repositório também conferem em tempo de execução que o objeto foi criado por `getSessionActor`.
 */
export type SessionActor = Readonly<{ userId: string; role: UserRole }> & { readonly [sessionActorBrand]: true };

const minted = new WeakSet<object>();

/** Único construtor de `SessionActor`. `null` sem sessão ou sem perfil com papel válido. */
export async function getSessionActor(): Promise<SessionActor | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = await getCurrentRole();
  if (role === null) return null;
  const actor = Object.freeze({ userId: user.id, role }) as unknown as SessionActor;
  minted.add(actor);
  return actor;
}

/** O objeto foi criado por `getSessionActor` neste processo (recusa cast e objeto forjado). */
export function isSessionActor(value: unknown): value is SessionActor {
  return typeof value === "object" && value !== null && minted.has(value);
}
