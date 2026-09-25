// Configuração da publicação: lê `ai_get_settings()` no momento da decisão (limiares e alertas críticos atuais;
// nunca os do resultado da extração). Transitório (RPC/rede) lança PortError transitório; ausente/inválida = null.
import { z } from "zod";
import { PortError } from "./ports.ts";
import type { PublicationSettings } from "./types.ts";

export type SettingsRpc = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const unit = z.coerce.number().min(0).max(1);
/** Schema próprio da publicação: só o que ela usa, inclusive `auto_publish_enabled` (a S08 não o conhece). */
export const publicationSettingsRowSchema = z
  .object({
    confidence_threshold: unit,
    item_confidence_threshold: unit,
    critical_alerts: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).max(50),
    auto_publish_enabled: z.boolean(),
  })
  .transform(
    (r): PublicationSettings => ({
      confidenceThreshold: r.confidence_threshold,
      itemConfidenceThreshold: r.item_confidence_threshold,
      criticalAlerts: r.critical_alerts,
      autoPublishEnabled: r.auto_publish_enabled,
    }),
  );

export interface PublicationSettingsProvider {
  /** `null` = configuração ausente ou inválida (falha fechada, registrada). Erro transitório lança. */
  load(): Promise<PublicationSettings | null>;
}

const isConfigError = (e: unknown): boolean => {
  const x = e as { code?: unknown; message?: unknown } | null;
  return !!x && (x.code === "P0002" || x.message === "rpc_not_found" || x.message === "rpc_invalid_response");
};

export function createPublicationSettings(deps: { rpc: SettingsRpc; clock: { now(): number }; cacheMs?: number }): PublicationSettingsProvider {
  const ttl = deps.cacheMs ?? 30_000;
  let cached: { value: PublicationSettings; at: number } | null = null;
  return {
    async load() {
      if (cached && deps.clock.now() - cached.at < ttl) return cached.value;
      let res: { data: unknown; error: unknown };
      try {
        res = await deps.rpc.rpc("ai_get_settings");
      } catch {
        throw new PortError("settings_unavailable", true);
      }
      if (res.error && !isConfigError(res.error)) throw new PortError("settings_unavailable", true);
      if (res.error) return null;
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      const parsed = publicationSettingsRowSchema.safeParse(row);
      if (!parsed.success) return null;
      cached = { value: parsed.data, at: deps.clock.now() };
      return parsed.data;
    },
  };
}
