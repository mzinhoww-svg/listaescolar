import { isDemoEnabled, type DemoEnv } from "@/features/cart/demo-provider";
import { DEMO_LIST_ID } from "@/features/cart/memory-list-reader";

import { InMemoryLeadListContextReader } from "./memory-context-reader";
import type { LeadListContextReader } from "./ports";

export const DEMO_SCHOOL_NAME = "Escola Demonstração";

/** Contexto da lista de demonstração da S12 (dados fictícios, `isDemo`). Só com a flag de demo (fail-closed). */
export function createDemoLeadListContextReader(env: DemoEnv): LeadListContextReader | null {
  if (!isDemoEnabled(env)) return null;
  return new InMemoryLeadListContextReader(
    new Map([
      [
        DEMO_LIST_ID,
        { schoolName: DEMO_SCHOOL_NAME, gradeLabel: "5º ano", schoolYear: 2027, items: [], isDemo: true },
      ],
    ]),
  );
}
