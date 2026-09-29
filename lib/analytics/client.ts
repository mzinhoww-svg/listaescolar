import { INGEST_PATH, SEND_BEFORE_CONSENT, type AnalyticsConfig } from "./config";
import { buildEvent } from "./sanitize";
import { isEventName, type EventName } from "./schema";

/**
 * Cliente mínimo de eventos (Ruling da S28: sem SDK, sem autocaptura, sem replay). Regras:
 * - antes da escolha: eventos só na fila em memória (limitada), `distinct_id` em memória, nada de storage,
 *   cookie, `identify` ou rede (`SEND_BEFORE_CONSENT = false`);
 * - `denied`/`revoke`: fila esvaziada sem enviar, envio parado, id apagado;
 * - `granted`: o id anônimo é guardado (via `IdStore`, só agora) e a fila é liberada; `identify` só com uuid.
 */

export type Consent = "unset" | "granted" | "denied";
export type IdStore = { load(): string | null; save(id: string): void; clear(): void };
type Enabled = Extract<AnalyticsConfig, { enabled: true }>;

export type AnalyticsClient = {
  track(name: EventName, props: Record<string, unknown>): void;
  setConsent(consent: Consent): void;
  identify(uuid: string): void;
  revoke(): void;
  flush(): void;
  state(): { consent: Consent; queued: number; distinctId: string };
};

type Deps = {
  config: Enabled;
  fetchImpl?: typeof fetch;
  idStore?: IdStore;
  uuid?: () => string;
  getCommon?: () => Record<string, unknown>;
};

type Queued = { event: string; distinct_id: string; properties: Record<string, unknown>; timestamp: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUEUE = 50;
const BATCH = 10;
const FLUSH_MS = 5_000;

export function createAnalyticsClient(deps: Deps): AnalyticsClient {
  const { config } = deps;
  const doFetch = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const newId = deps.uuid ?? (() => crypto.randomUUID());
  let consent: Consent = "unset";
  let anonId = newId();
  let distinctId = anonId;
  let identified = false;
  let pendingIdentify: string | null = null;
  let queue: Queued[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const common = () => ({ is_internal: config.appEnv !== "production", app_env: config.appEnv, ...deps.getCommon?.() });

  function send(batch: Queued[]) {
    if (batch.length === 0) return;
    const one = batch.length === 1;
    const wire = batch.map((e) => ({ api_key: config.key, ...e, properties: { token: config.key, ...e.properties } }));
    const body = one ? wire[0] : { api_key: config.key, batch: wire };
    try {
      // `keepalive` cobre o `pagehide`; `credentials: "omit"` impede o cookie de sessão do app de ir ao proxy.
      void doFetch(`${INGEST_PATH}${one ? "/i/v0/e" : "/batch"}`, {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => undefined);
    } catch {
      // Falha de envio nunca chega ao produto.
    }
  }

  function flush() {
    stopTimer();
    if (consent !== "granted" && !SEND_BEFORE_CONSENT) return;
    const batch = queue;
    queue = [];
    for (let i = 0; i < batch.length; i += BATCH) send(batch.slice(i, i + BATCH));
  }

  function schedule() {
    if (consent !== "granted") return;
    if (queue.length >= BATCH) return flush();
    timer ??= setTimeout(flush, FLUSH_MS);
  }

  function track(name: EventName, props: Record<string, unknown>) {
    if (consent === "denied" || !isEventName(name)) return;
    const built = buildEvent(name, props, common());
    if (!built.ok) return;
    queue.push({
      event: name,
      distinct_id: distinctId,
      properties: { ...built.properties, ...(identified ? {} : { $process_person_profile: false }), $lib: "listacerta" },
      timestamp: new Date().toISOString(),
    });
    if (queue.length > MAX_QUEUE) queue.shift();
    schedule();
  }

  function applyIdentify(uuid: string) {
    const from = distinctId;
    distinctId = uuid;
    identified = true;
    // Eventos ainda na fila passam a pertencer ao perfil (mesma pessoa, mesma página).
    queue = queue.map((e) => ({ ...e, distinct_id: uuid, properties: { ...e.properties, $process_person_profile: undefined } }));
    queue.push({
      event: "$identify",
      distinct_id: uuid,
      properties: { $anon_distinct_id: from, $lib: "listacerta" },
      timestamp: new Date().toISOString(),
    });
    flush();
  }

  function identify(uuid: string) {
    if (typeof uuid !== "string" || !UUID.test(uuid)) return; // e-mail, telefone ou qualquer outra coisa: ignorado
    if (consent === "granted") applyIdentify(uuid);
    else if (consent === "unset") pendingIdentify = uuid; // só o uuid, só em memória
  }

  function drop() {
    stopTimer();
    queue = [];
    pendingIdentify = null;
  }

  function revoke() {
    drop();
    consent = "denied";
    identified = false;
    anonId = newId();
    distinctId = anonId;
    deps.idStore?.clear();
  }

  function setConsent(next: Consent) {
    if (next === consent) return;
    if (next === "denied") {
      if (consent === "granted") revoke();
      else {
        drop();
        consent = "denied";
      }
      return;
    }
    if (next === "granted") {
      consent = "granted";
      const stored = deps.idStore?.load();
      if (stored && UUID.test(stored)) {
        anonId = stored;
        if (!identified) {
          distinctId = stored;
          queue = queue.map((e) => ({ ...e, distinct_id: stored }));
        }
      } else deps.idStore?.save(anonId);
      const pending = pendingIdentify;
      pendingIdentify = null;
      if (pending) applyIdentify(pending);
      flush();
      return;
    }
    consent = "unset";
  }

  return {
    track,
    setConsent,
    identify,
    revoke,
    flush,
    state: () => ({ consent, queued: queue.length, distinctId }),
  };
}
