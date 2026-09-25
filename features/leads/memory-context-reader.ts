import type { LeadListContext, LeadListContextReader } from "./ports";

export class InMemoryLeadListContextReader implements LeadListContextReader {
  constructor(private readonly contexts: ReadonlyMap<string, LeadListContext>) {}

  async getContext(listId: string): Promise<LeadListContext | null> {
    const found = this.contexts.get(listId);
    return found ? { ...found, items: found.items.map((i) => ({ ...i })) } : null;
  }
}
