import { z } from "zod";
import {
  type AiSettings,
  type Clock,
  type DecisionRecord,
  type DecisionRecorder,
  type Prompt,
  type PromptRegistry,
  type SettingsProvider,
} from "@/supabase/functions/_shared/ai/types.ts";
import type { Task } from "@/supabase/functions/_shared/ai/router.ts";

/** Relógio controlado: timers só disparam em advance(). */
export class FakeClock implements Clock {
  private t = 0;
  private timers: { at: number; fn: () => void; id: number; live: boolean }[] = [];
  private seq = 0;
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): () => void {
    const timer = { at: this.t + ms, fn, id: this.seq++, live: true };
    this.timers.push(timer);
    return () => {
      timer.live = false;
    };
  }
  pending(): number {
    return this.timers.filter((x) => x.live).length;
  }
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      const due = this.timers
        .filter((x) => x.live && x.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      due.live = false;
      this.t = Math.max(this.t, due.at);
      due.fn();
    }
    this.t = target;
  }
}

export const flush = () => new Promise<void>((r) => setTimeout(r, 0));

export function makeSettings(over: Partial<AiSettings> = {}): AiSettings {
  return {
    confidenceThreshold: 0.8,
    itemConfidenceThreshold: 0.6,
    criticalAlerts: ["handwritten"],
    routes: {
      cheap: { provider: "fake", timeoutMs: 20000 },
      strong: { provider: "fake", timeoutMs: 40000 },
      vision: { provider: "fake", timeoutMs: 40000 },
    },
    maxEscalations: 1,
    pipelineVersion: "s08.1",
    ...over,
  };
}

export const settingsOf = (s: AiSettings | (() => Promise<AiSettings>)): SettingsProvider => ({
  load: typeof s === "function" ? s : async () => s,
});

export const PROMPT: Prompt = { key: "extract_list", version: 1, text: "instrucoes", schema: {} };
export const promptsOf = (p: Prompt | (() => Promise<Prompt>) = PROMPT): PromptRegistry => ({
  get: typeof p === "function" ? p : async () => p,
});

export function makeRecorder(): DecisionRecorder & { rows: DecisionRecord[] } {
  const rows: DecisionRecord[] = [];
  return {
    rows,
    async record(d) {
      rows.push(d);
    },
  };
}

export const resultSchema = z.object({
  items: z.array(z.object({ name: z.string().min(1), confidence: z.number().min(0).max(1) })),
});
export type Res = z.infer<typeof resultSchema>;

export function makeTask(over: Partial<Task<Res>> = {}): Task<Res> {
  return {
    entityType: "list_submission",
    entityId: "11111111-1111-4111-8111-111111111111",
    promptKey: "extract_list",
    buildRequest: (p) => ({
      messages: [
        { role: "system", content: p.text },
        { role: "user", content: "documento" },
      ],
      responseFormat: "json",
    }),
    schema: resultSchema,
    evaluate: (r) => ({
      overall: r.items.length ? Math.min(...r.items.map((i) => i.confidence)) : 0,
      items: r.items.map((i) => i.confidence),
      alerts: [],
    }),
    ...over,
  };
}

export const good = (c = 0.95) => ({ json: { items: [{ name: "Caderno", confidence: c }] } });
