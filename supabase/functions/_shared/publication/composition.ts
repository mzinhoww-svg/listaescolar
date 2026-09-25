// Composição da publicação a partir do ambiente. Desde a S11 as portas são REAIS sempre que há cliente de serviço (`rpc`):
// ListPublisher = `list_publish_from_pipeline`, PublicationContextReader = `publication_context` (rpc-ports.ts). As portas
// em memória só existem com FAKE_PUBLICATION_FIXTURE válido E APP_ENV local|development (NÃO preview/staging: o staging é o
// único Supabase real e `ai_decisions` é append-only, então uma publicação falsa ali não se desfaz) e vencem as reais nesse
// caso explícito (fixtures de E2E com escolas que não existem no banco). Em staging e produção nunca há porta nula.
// O publicador em memória é UM por processo e por fixture (memoizado): app e worker são processos distintos e não
// compartilham estado; dentro de cada um, versão anterior, lista atual e idempotência valem entre requisições.
import { type EnvLike, isProductionEnv } from "../ai/env.ts";
import { createValidatedRpc, type RawRpc } from "../ai/rpc.ts";
import type { PublicationDeps } from "./decide.ts";
import { MemoryListPublisher, MemoryPublicationContextReader, parsePublicationFixture } from "./memory.ts";
import { createRpcPublicationPorts } from "./rpc-ports.ts";
import { createRpcPublicationStore } from "./rpc-store.ts";
import { createPublicationSettings } from "./settings.ts";

export type PublicationEnv = EnvLike & { FAKE_PUBLICATION_FIXTURE?: string };

export const MEMORY_PORT_ENVS = ["local", "development"] as const;

/** As portas em memória só existem com a fixture válida, APP_ENV explícito `local`/`development` e VERCEL_ENV ausente ou `development` (um preview com APP_ENV=local por engano não liga portas contra o staging). */
export function publicationPortsAllowed(env: PublicationEnv): boolean {
  const app = (env.APP_ENV ?? "").trim();
  const vercel = (env.VERCEL_ENV ?? "").trim();
  return (MEMORY_PORT_ENVS as readonly string[]).includes(app) && (vercel === "" || vercel === "development") && !isProductionEnv(env) && parsePublicationFixture(env.FAKE_PUBLICATION_FIXTURE) !== null;
}

/** Verdadeiro quando a publicação vem da porta em memória (demonstração): a tela mostra o selo "Demonstração". */
export function publicationIsDemo(env: PublicationEnv): boolean {
  return publicationPortsAllowed(env);
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
  const memory = fixture ? sharedPublisher(o.env.FAKE_PUBLICATION_FIXTURE ?? "") : null;
  const real = fixture ? null : createRpcPublicationPorts(o.rpc, { now: () => new Date(o.clock.now()) });
  return {
    store: createRpcPublicationStore(o.rpc),
    settings: createPublicationSettings({ rpc: createValidatedRpc(o.rpc), clock: o.clock }),
    context: fixture ? new MemoryPublicationContextReader(fixture, memory ?? undefined) : (real?.context ?? null),
    publisher: memory ?? real?.publisher ?? null,
    clock: o.clock,
    ...(o.onAlert ? { onAlert: o.onAlert } : {}),
  };
}
