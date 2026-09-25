// Adapter do OpenRouter (API compatível com chat/completions). Só `fetch`: sem SDK.
// Os nomes de modelo vêm do ambiente (AI_MODEL_CHEAP, AI_MODEL_STRONG, AI_MODEL_VISION); nunca do código.
import { z } from "zod";
import { AiError } from "./errors.ts";
import type {
  CallOptions,
  LlmMessage,
  LlmPart,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  OcrProvider,
  OcrResponse,
  ProviderFactory,
  Route,
} from "./types.ts";

export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const MAX_RESPONSE_CHARS = 5_000_000;
const OCR_INSTRUCTION =
  "Transcreva fielmente todo o texto do documento, na ordem de leitura, sem comentar, resumir ou acrescentar nada.";

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

/** Lê só as variáveis AI_MODEL_*; vazio = ausente. */
export function loadModelsFromEnv(env: Record<string, string | undefined>): Record<Route, string | undefined> {
  const pick = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return { cheap: pick(env.AI_MODEL_CHEAP), strong: pick(env.AI_MODEL_STRONG), vision: pick(env.AI_MODEL_VISION) };
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function partToWire(p: LlmPart): unknown {
  if (p.type === "text") return { type: "text", text: p.text };
  if (p.type === "image") {
    if (!IMAGE_MIMES.has(p.mime)) throw new AiError("provider_error", { transient: false, detail: "unsupported_mime" });
    return { type: "image_url", image_url: { url: `data:${p.mime};base64,${toBase64(p.bytes)}` } };
  }
  if (p.mime !== "application/pdf") throw new AiError("provider_error", { transient: false, detail: "unsupported_mime" });
  // PDF: parte `file` com data URL (formato documentado do OpenRouter; confirmar com scripts/ai-smoke.ts).
  const filename = p.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "document.pdf";
  return { type: "file", file: { filename, file_data: `data:application/pdf;base64,${toBase64(p.bytes)}` } };
}
const messageToWire = (m: LlmMessage) => ({
  role: m.role,
  content: typeof m.content === "string" ? m.content : m.content.map(partToWire),
});

const responseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() })), z.null()]).optional() }) }))
    .min(1),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional(), total_tokens: z.number().optional() })
    .optional(),
});

const isTransientStatus = (s: number) => s === 408 || s === 425 || s === 429 || s >= 500;

export class OpenRouterAdapter implements LlmProvider, OcrProvider {
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly now: () => number;

  constructor(cfg: { apiKey: string; model: string; fetchImpl?: FetchLike; baseUrl?: string; now?: () => number }) {
    if (!cfg.apiKey || !cfg.apiKey.trim()) throw new AiError("ai_not_configured", { detail: "missing_key" });
    if (!cfg.model || !cfg.model.trim()) throw new AiError("ai_not_configured", { detail: "missing_model" });
    this.apiKey = cfg.apiKey.trim();
    this.model = cfg.model.trim();
    this.fetchImpl = cfg.fetchImpl ?? defaultFetch;
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.now = cfg.now ?? (() => Date.now());
  }

  async complete(req: LlmRequest, opts: CallOptions): Promise<LlmResponse> {
    const t0 = this.now();
    const body: Record<string, unknown> = { model: this.model, messages: req.messages.map(messageToWire) };
    if (req.responseFormat === "json") body.response_format = { type: "json_object" };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;

    let raw: string;
    let status: number;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      status = res.status;
      raw = await res.text();
      if (!res.ok) throw new AiError("provider_error", { transient: isTransientStatus(status), status, detail: `http_${status}` });
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (opts.signal?.aborted || (e as { name?: string } | null)?.name === "AbortError") throw new AiError("aborted");
      throw new AiError("provider_error", { transient: true, detail: "network_error" }); // nunca repassa e.message
    }
    if (raw.length > MAX_RESPONSE_CHARS) throw new AiError("provider_error", { transient: true, status, detail: "response_too_large" });

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AiError("provider_error", { transient: true, status, detail: "unexpected_response" });
    }
    const embedded = (json as { error?: { code?: unknown } } | null)?.error;
    if (embedded && typeof embedded === "object") {
      const code = Number((embedded as { code?: unknown }).code);
      throw new AiError("provider_error", { transient: Number.isFinite(code) && isTransientStatus(code), status, detail: "provider_reported_error" });
    }
    const parsed = responseSchema.safeParse(json);
    const content = parsed.success ? parsed.data.choices[0]?.message.content : undefined;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c.text ?? "").join("") : undefined;
    if (!parsed.success || text === undefined || text === "") {
      throw new AiError("provider_error", { transient: true, status, detail: "unexpected_response" });
    }
    const u = parsed.data.usage;
    return {
      text,
      model: this.model,
      usage: u ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens } : undefined,
      latencyMs: Math.max(0, this.now() - t0),
    };
  }

  /** OCR pelo modelo de visão: transcreve o documento (imagem ou PDF). */
  async extractText(input: { bytes: Uint8Array; mime: string }, opts: CallOptions): Promise<OcrResponse> {
    const part: LlmPart =
      input.mime === "application/pdf"
        ? { type: "file", mime: input.mime, fileName: "document.pdf", bytes: input.bytes }
        : { type: "image", mime: input.mime, bytes: input.bytes };
    const r = await this.complete(
      { messages: [{ role: "user", content: [{ type: "text", text: OCR_INSTRUCTION }, part] }], temperature: 0 },
      opts,
    );
    return { text: r.text, model: r.model, latencyMs: r.latencyMs };
  }
}

/** Fábrica por rota: modelo de AI_MODEL_*; rota sem modelo/chave = erro permanente, antes de qualquer rede. */
export function openRouterProviderFactory(cfg: {
  apiKey: string | undefined;
  models: Partial<Record<Route, string | undefined>>;
  fetchImpl?: FetchLike;
  baseUrl?: string;
}): ProviderFactory {
  return (route) => {
    const model = cfg.models[route]?.trim();
    if (!model) throw new AiError(route === "vision" ? "vision_model_missing" : "ai_not_configured", { detail: `model_${route}` });
    if (!cfg.apiKey?.trim()) throw new AiError("ai_not_configured", { detail: "missing_key" });
    return new OpenRouterAdapter({ apiKey: cfg.apiKey, model, fetchImpl: cfg.fetchImpl, baseUrl: cfg.baseUrl });
  };
}
