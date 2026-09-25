import type { Clock } from "./ports";

/** Relógio real. `delay` limpa o temporizador se `signal` abortar (a promessa então nunca resolve). */
export const systemClock: Clock = {
  now: () => Date.now(),
  delay(ms, signal) {
    return new Promise<void>((resolve) => {
      if (signal?.aborted) return;
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => clearTimeout(timer), { once: true });
    });
  },
};
