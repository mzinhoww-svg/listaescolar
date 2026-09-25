import { isDemoEnabled, type DemoEnv } from "./demo-provider";
import type { ListItem, ListReader } from "./ports";

export class InMemoryListReader implements ListReader {
  constructor(private readonly lists: ReadonlyMap<string, readonly ListItem[]>) {}

  async getItems(listId: string): Promise<ListItem[] | null> {
    const items = this.lists.get(listId);
    return items ? items.map((i) => ({ ...i })) : null;
  }
}

export const DEMO_LIST_ID = "00000000-0000-4000-8000-00000000d3a0";

/** Lista de demonstração (itens genéricos, sem dado de escola nem de menor). Só com a flag de demo. */
export function createDemoListReader(env: DemoEnv): ListReader | null {
  if (!isDemoEnabled(env)) return null;
  return new InMemoryListReader(
    new Map([
      [
        DEMO_LIST_ID,
        [
          { id: "00000000-0000-4000-8000-00000000d301", name: "Caderno 96 folhas", quantity: 4 },
          { id: "00000000-0000-4000-8000-00000000d302", name: "Lápis preto HB", quantity: 12 },
          { id: "00000000-0000-4000-8000-00000000d303", name: "Borracha branca", quantity: 2 },
          { id: "00000000-0000-4000-8000-00000000d304", name: "Cola branca 90g", quantity: 1 },
          { id: "00000000-0000-4000-8000-00000000d305", name: "Tesoura sem ponta", quantity: 1 },
        ],
      ],
    ]),
  );
}
