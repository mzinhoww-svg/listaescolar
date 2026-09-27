import "server-only";

import type { Endpoint } from "../contract";
import { cartsMatchEndpoint } from "./carts-match";
import { listEndpoint } from "./list";
import { listItemsEndpoint } from "./list-items";
import { schoolEndpoint } from "./school";
import { schoolListsEndpoint } from "./school-lists";
import { schoolsEndpoint } from "./schools";

// Registro único dos 6 endpoints do contrato (S24, Ruling: agregador extra dentro de `api/endpoints/`, não previsto
// nominalmente no brief, para `contract.ts` ficar livre de importar os módulos que o consomem). Fonte para
// `openapi.json`, o teste de completude (glob de `app/v1/**/route.ts`) e a varredura de vazamento.

/** Cada endpoint tem seus próprios tipos concretos (usados com tipagem completa pelo `route.ts` de cada um, via
 * `schoolsEndpoint.entry`/`.impl` etc.); aqui, para guardá-los lado a lado num array heterogêneo, o tipo estático é
 * apagado por um cast duplo através de `unknown` — nunca `any` — seguro porque o `handler` só chama `impl` depois
 * de validar a entrada por Zod contra o próprio `entry` do mesmo endpoint (nunca o de outro). */
function erase<T>(endpoint: T): Endpoint {
  return endpoint as unknown as Endpoint;
}

export const ENDPOINTS: readonly Endpoint[] = [
  erase(schoolsEndpoint),
  erase(schoolEndpoint),
  erase(schoolListsEndpoint),
  erase(listEndpoint),
  erase(listItemsEndpoint),
  erase(cartsMatchEndpoint),
];

export const ENDPOINTS_BY_ID: ReadonlyMap<string, Endpoint> = new Map(ENDPOINTS.map((e) => [e.entry.id, e]));

export { cartsMatchEndpoint, listEndpoint, listItemsEndpoint, schoolEndpoint, schoolListsEndpoint, schoolsEndpoint };
