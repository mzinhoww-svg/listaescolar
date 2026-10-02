import { z } from "zod";

import type { EndpointEntry } from "@/features/b2b/api/contract";
import { successExampleEnvelope } from "@/features/b2b/api/openapi";
import { B2B_API_ERROR_STATUS, B2B_API_ERROR_CODES, type B2bApiErrorCode } from "@/features/b2b/errors";
import { B2B_API_MESSAGE } from "@/features/b2b/messages";
import { SCOPE_LABEL } from "@/components/b2b/ScopeChips";

import { CodeSample } from "./CodeSample";
import { SchemaTable, type ObjectJsonSchema } from "./SchemaTable";

// Um endpoint do contrato real, documentado ao vivo (B2B03 `/b2b/docs` e público `/parceiros/docs`, mesmo
// componente, sem barra lateral). Nunca uma lista escrita à mão: tudo vem de `entry` (features/b2b/api/contract),
// a mesma fonte que valida a API e gera `openapi.json`.

function toJsonSchema(schema: z.ZodTypeAny | undefined): ObjectJsonSchema | undefined {
  if (!schema) return undefined;
  return z.toJSONSchema(schema, { target: "draft-2020-12" }) as ObjectJsonSchema;
}

/** Todos os erros que `B2B_API_ERROR_CODES` reconhece são candidatos globais (401 sem chave, etc.); só os
 * declarados no `entry` aparecem, na ordem canônica do domínio. */
function orderedErrors(entry: EndpointEntry): readonly B2bApiErrorCode[] {
  return B2B_API_ERROR_CODES.filter((c) => entry.errors.includes(c));
}

export function EndpointDoc({ entry }: { entry: EndpointEntry }) {
  const paramsSchema = toJsonSchema(entry.paramsSchema);
  const querySchema = toJsonSchema(entry.querySchema);
  const bodySchema = toJsonSchema(entry.bodySchema);
  const successBody = successExampleEnvelope(entry.example.response);
  return (
    <section id={entry.id} className="flex flex-col gap-4 rounded-[24px] bg-white p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="bg-tinta text-papel rounded-botao px-2.5 py-1 text-[12px] font-extrabold">{entry.method}</span>
        <code className="text-[15px] font-extrabold">{entry.path}</code>
        <span className="bg-campo text-texto-2 rounded-botao px-2.5 py-1 text-[12px] font-extrabold">
          escopo {SCOPE_LABEL[entry.scope]}
        </span>
      </div>
      <p className="text-texto-2 text-[14px] font-semibold">{entry.summary}</p>
      <SchemaTable schema={paramsSchema} caption="Parâmetros de caminho" />
      <SchemaTable schema={querySchema} caption="Parâmetros de consulta" />
      <SchemaTable schema={bodySchema} caption="Corpo da requisição" />
      <div>
        <p className="text-texto-3 mb-1.5 text-[12px] font-extrabold tracking-[0.04em] uppercase">Erros possíveis</p>
        <ul className="flex flex-wrap gap-2">
          {orderedErrors(entry).map((code) => (
            <li key={code} className="bg-campo text-texto-2 rounded-botao px-2.5 py-1 text-[12px] font-bold">
              {B2B_API_ERROR_STATUS[code]} {code} — {B2B_API_MESSAGE[code]}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {entry.example.request !== undefined ? <CodeSample title="Exemplo de requisição (ilustrativo)" code={entry.example.request} /> : null}
        <CodeSample title="Exemplo de resposta (ilustrativo)" code={successBody} />
      </div>
    </section>
  );
}
