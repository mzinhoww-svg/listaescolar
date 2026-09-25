// Composição da publicação a partir do ambiente. Único lugar que liga as portas em memória: só com
// FAKE_PUBLICATION_FIXTURE válido E APP_ENV explícito não produtivo (mesma trava do `fake` da S08).
// Sem isso (produção e staging até a S11) as portas são nulas e todo envio vai a human_review, registrado.
import { type EnvLike, explicitNonProduction } from "../ai/env.ts";
import { createValidatedRpc, type RawRpc } from "../ai/rpc.ts";
import type { PublicationDeps } from "./decide.ts";
import { MemoryListPublisher, MemoryPublicationContextReader, parsePublicationFixture } from "./memory.ts";
import { createRpcPublicationStore } from "./rpc-store.ts";
import { createPublicationSettings } from "./settings.ts";

export type PublicationEnv = EnvLike & { FAKE_PUBLICATION_FIXTURE?: string };

/** As portas em memória só existem com a fixture válida e o ambiente explicitamente não produtivo. */
export function publicationPortsAllowed(env: PublicationEnv): boolean {
  return explicitNonProduction(env) && parsePublicationFixture(env.FAKE_PUBLICATION_FIXTURE) !== null;
}

export function createPublicationDeps(o: {
  env: PublicationEnv;
  rpc: RawRpc;
  clock: PublicationDeps["clock"];
  onAlert?: PublicationDeps["onAlert"];
}): PublicationDeps {
  const fixture = publicationPortsAllowed(o.env) ? parsePublicationFixture(o.env.FAKE_PUBLICATION_FIXTURE) : null;
  const publisher = fixture ? new MemoryListPublisher() : null;
  return {
    store: createRpcPublicationStore(o.rpc),
    settings: createPublicationSettings({ rpc: createValidatedRpc(o.rpc), clock: o.clock }),
    context: fixture ? new MemoryPublicationContextReader(fixture, publisher ?? undefined) : null,
    publisher,
    clock: o.clock,
    ...(o.onAlert ? { onAlert: o.onAlert } : {}),
  };
}
