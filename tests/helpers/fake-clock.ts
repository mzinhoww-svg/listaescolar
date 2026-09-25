type Timer = { at: number; resolve: () => void; signal?: AbortSignal; onAbort?: () => void };

/** Relógio falso: `delay` só resolve quando `advance` cruza o prazo. */
export class FakeClock {
  private t = 0;
  private timers: Timer[] = [];

  now() {
    return this.t;
  }

  pending() {
    return this.timers.length;
  }

  delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer: Timer = { at: this.t + ms, resolve, signal };
      if (signal) {
        if (signal.aborted) return;
        timer.onAbort = () => {
          this.timers = this.timers.filter((x) => x !== timer);
        };
        signal.addEventListener("abort", timer.onAbort, { once: true });
      }
      this.timers.push(timer);
    });
  }

  advance(ms: number) {
    this.t += ms;
    const due = this.timers.filter((x) => x.at <= this.t);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const timer of due) timer.resolve();
  }
}
