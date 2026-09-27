import type { SessionActor } from "@/features/auth/actor";

import { WidgetServiceError } from "./errors";
import type { WidgetConfigRow } from "./repository";
import { SaveWidgetConfigInputSchema } from "./schemas";

export type WidgetRepository = {
  getMyWidgetConfig: (actor: SessionActor) => Promise<WidgetConfigRow | null>;
  saveWidgetConfig: (actor: SessionActor, input: { accentColor: string; cartTargetDomain: string; enabled: boolean }) => Promise<void>;
};

export class WidgetService {
  constructor(private readonly deps: { repo: WidgetRepository }) {}

  async getMyConfig(actor: SessionActor): Promise<WidgetConfigRow | null> {
    return this.deps.repo.getMyWidgetConfig(actor);
  }

  async saveConfig(actor: SessionActor, raw: unknown): Promise<void> {
    const parsed = SaveWidgetConfigInputSchema.safeParse(raw);
    if (!parsed.success) throw new WidgetServiceError("configuração inválida", "invalid_input");
    await this.deps.repo.saveWidgetConfig(actor, parsed.data);
  }
}
