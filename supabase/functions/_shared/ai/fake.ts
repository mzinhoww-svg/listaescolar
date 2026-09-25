// Provedor falso, determinístico e scriptável (testes e demo). Não faz rede.
import { AiError, type AiErrorCode } from "./errors.ts";
import type { CallOptions, Clock, LlmProvider, LlmRequest, LlmResponse, OcrProvider, OcrResponse } from "./types.ts";
import { systemClock } from "./types.ts";

/** Passo do script (dados puros: pode vir de JSON). */
export type FakeStep = {
  json?: unknown;
  text?: string;
  delayMs?: number;
  /** Fica pendente até o AbortSignal. */
  hang?: boolean;
  fail?: { code: AiErrorCode; transient?: boolean; status?: number };
};
export type FakeScript = FakeStep[] | ((call: number, req: LlmRequest) => FakeStep);
export type FakeCall = { request: LlmRequest; aborted: () => boolean };

export class FakeProvider implements LlmProvider, OcrProvider {
  readonly model: string;
  readonly calls: FakeCall[] = [];
  private readonly clock: Clock;

  constructor(
    private readonly script: FakeScript,
    opts: { model?: string; clock?: Clock } = {},
  ) {
    this.model = opts.model ?? "fake-model";
    this.clock = opts.clock ?? systemClock;
  }

  async complete(req: LlmRequest, opts: CallOptions): Promise<LlmResponse> {
    const t0 = this.clock.now();
    const n = this.calls.length;
    const signal = opts.signal;
    this.calls.push({ request: req, aborted: () => signal?.aborted === true });
    const step = typeof this.script === "function" ? this.script(n, req) : this.script[n];
    if (!step) throw new AiError("provider_error", { transient: false, detail: "fake_script_exhausted" });
    if (signal?.aborted) throw new AiError("aborted");
    if (step.hang) await this.wait(undefined, signal);
    else if (step.delayMs) await this.wait(step.delayMs, signal);
    if (step.fail) throw new AiError(step.fail.code, { transient: step.fail.transient, status: step.fail.status });
    const text = step.text ?? (step.json !== undefined ? JSON.stringify(step.json) : "");
    return { text, model: this.model, latencyMs: Math.max(0, this.clock.now() - t0) };
  }

  async extractText(input: { bytes: Uint8Array; mime: string }, opts: CallOptions): Promise<OcrResponse> {
    const r = await this.complete(
      { messages: [{ role: "user", content: [{ type: "file", mime: input.mime, fileName: "input", bytes: input.bytes }] }] },
      opts,
    );
    return { text: r.text, model: r.model, latencyMs: r.latencyMs };
  }

  private wait(ms: number | undefined, signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      let cancel: () => void = () => {};
      const onAbort = () => {
        cancel();
        reject(new AiError("aborted"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (ms !== undefined) {
        cancel = this.clock.setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
      }
    });
  }
}
