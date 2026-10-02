import "server-only";

import { cookies } from "next/headers";
import { after } from "next/server";

import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";
import { capture, type CaptureConfig, type Emit } from "../../supabase/functions/_shared/analytics/capture";
import { CONSENT_COOKIE, getAnalyticsConfig, USER_ACTION_EVENTS } from "./config";
import { isInternalAccount } from "./internal";
import type { EventName } from "./schema";

type Opts = { distinctId?: string; isInternal?: boolean };

function serverConfig(): CaptureConfig | null {
  const c = getAnalyticsConfig(process.env);
  return c.enabled ? { key: c.key, host: c.host, appEnv: c.appEnv } : null;
}

/**
 * A conta da requisição é interna (revisão M6)? Lê a sessão já validada (`getCurrentUser`/`getCurrentRole`, com cache
 * por requisição). Fora de uma requisição, ou com erro, é `false`. O e-mail nunca sai daqui, só o booleano.
 */
async function currentAccountIsInternal(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user) return false;
    return isInternalAccount({ email: user.email, role: await getCurrentRole() });
  } catch {
    return false;
  }
}

async function dispatch(name: EventName, props: Record<string, unknown>, opts: Opts): Promise<void> {
  try {
    const cfg = serverConfig();
    if (!cfg) return;
    const isInternal = opts.isInternal ?? (await currentAccountIsInternal());
    const run = () => capture(cfg, name, props, { ...(opts.distinctId ? { distinctId: opts.distinctId } : {}), isInternal }).then(() => undefined);
    try {
      after(run);
    } catch {
      void run(); // fora de escopo de requisição (script, teste)
    }
  } catch {
    // Medição nunca quebra o produto.
  }
}

/**
 * Evento de servidor (fato gravado no banco). Sem chave, não faz nada. Nunca lança nem atrasa a resposta: o envio
 * roda em `after()` (ou solto, fora de uma requisição). Falha do PostHog não altera o resultado de nenhuma ação.
 */
export function captureServer(name: EventName, props: Record<string, unknown>, opts: Opts = {}): void {
  // Ação do usuário (login, clique de compra) só pelo caminho com consentimento: `captureUserAction`.
  if (USER_ACTION_EVENTS.includes(name)) return;
  void dispatch(name, props, opts);
}

/**
 * Evento de servidor que nasce de AÇÃO do usuário (`login_completed`, `purchase_clicked`): só sai se o navegador
 * mandou o cookie de estado `lc_analytics_consent=granted` (o aceite da medição). Sem ele, ou se o cookie não puder
 * ser lido, não emite. Sempre com `await`, para o cookie ser lido dentro do escopo da requisição.
 */
export async function captureUserAction(name: EventName, props: Record<string, unknown>, opts: Opts = {}): Promise<void> {
  try {
    if (USER_ACTION_EVENTS.includes(name)) {
      const jar = await cookies();
      if (jar.get(CONSENT_COOKIE)?.value !== "granted") return;
    }
    await dispatch(name, props, opts);
  } catch {
    // Sem escopo de requisição ou erro de leitura: sem consentimento comprovado, não emite.
  }
}

type RoleReader = { from(table: "profiles"): { select(cols: "role"): { eq(col: "id", v: string): { maybeSingle(): PromiseLike<{ data: { role?: unknown } | null }> } } } };

/**
 * `login_completed`: a sessão acabou de ser criada e ainda não está nos cookies da REQUISIÇÃO, então a conta vem do
 * resultado da autenticação (`user`) e o papel é lido pelo mesmo cliente que acabou de autenticar.
 */
export async function captureLogin(method: "magic_link" | "google", supabase: unknown, user: { id: string; email?: string | null | undefined }): Promise<void> {
  let role: unknown = null;
  try {
    role = (await (supabase as RoleReader).from("profiles").select("role").eq("id", user.id).maybeSingle()).data?.role ?? null;
  } catch {
    role = null;
  }
  await captureUserAction("login_completed", { method }, { isInternal: isInternalAccount({ email: user.email, role: typeof role === "string" ? role : null }) });
}

/**
 * Gancho de medição (`Emit`) para os serviços compartilhados com a Edge Function. Eventos de ação do usuário passam
 * pelo consentimento (devolve a promessa para o serviço poder esperar); fatos de negócio saem direto.
 */
export const emitServer: Emit = (name, props) =>
  USER_ACTION_EVENTS.includes(name) ? captureUserAction(name, props) : captureServer(name, props);
