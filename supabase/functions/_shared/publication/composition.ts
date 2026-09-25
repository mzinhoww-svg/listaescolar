// Composição da publicação a partir do ambiente. Único lugar que liga as portas em memória: só com
// FAKE_PUBLICATION_FIXTURE válido E APP_ENV local|development (NÃO preview/staging: o staging é o único Supabase real
// e `ai_decisions` é append-only, então uma publicação falsa ali não se desfaz). Mais estrita que a trava do `fake`
// da S08. Sem isso (produção, preview e staging até a S11) as portas são nulas e todo envio vai a human_review.
// O publicador em memória é UM por processo e por fixture (memoizado): app e worker são processos distintos e não
// compartilham estado; dentro de cada um, versão anterior, lista atual e idempotência valem entre requisições.
import { type EnvLike, isProductionEnv } from "../ai/env.ts";
import { createValidatedRpc, type RawRpc } from "../ai/rpc.ts";
import type { PublicationDeps } from "./decide.ts";
import { MemoryListPublisher, MemoryPublicationContextReader, parsePublicationFixture } from "./memory.ts";
import { createRpcPublicationStore } from "./rpc-store.ts";
import { createPublicationSettings } from "./settings.ts";

export type PublicationEnv = EnvLike & { FAKE_PUBLICATION_FIXTURE?: string };

export const MEMORY_PORT_ENVS = ["local", "development"] as const;

/** As portas em memória só existem com a fixture válida e APP_ENV explícito `local` ou `development`. */
export function publicationPortsAllowed(env: PublicationEnv): boolean {
  const app = (env.APP_ENV ?? "").trim();
  return (MEMORY_PORT_ENVS as readonly string[]).includes(app) && !isProductionEnv(env) && parsePublicationFixture(env.FAKE_PUBLICATION_FIXTURE) !== null;
}

const publishers = new Map<string, MemoryListPublisher>();
/** Um publicador por fixture (string) por processo; sobrevive entre requisições. */
function sharedPublisher(fixtureRaw: string): MemoryListPublisher {
  let p = publishers.get(fixtureRaw);
  if (!p) publishers.set(fixtureRaw, (p = new MemoryListPublisher()));
  return p;
}
/** Só para testes: esquece os publicadores memoizados. */
export function resetMemoryPublishers(): void {
  publishers.clear();
}

export function createPublicationDeps(o: {
  env: PublicationEnv;
  rpc: RawRpc;
  clock: PublicationDeps["clock"];
  onAlert?: PublicationDeps["onAlert"];
}): PublicationDeps {
  const fixture = publicationPortsAllowed(o.env) ? parsePublicationFixture(o.env.FAKE_PUBLICATION_FIXTURE) : null;
  const publisher = fixture ? sharedPublisher(o.env.FAKE_PUBLICATION_FIXTURE ?? "") : null;
  return {
    store: createRpcPublicationStore(o.rpc),
    settings: createPublicationSettings({ rpc: createValidatedRpc(o.rpc), clock: o.clock }),
    context: fixture ? new MemoryPublicationContextReader(fixture, publisher ?? undefined) : null,
    publisher,
    clock: o.clock,
    ...(o.onAlert ? { onAlert: o.onAlert } : {}),
  };
}
