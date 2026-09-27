// Extração de itens de lista escolar: saída do modelo -> resultado normalizado, alertas e mensagem ao modelo.
// Fonte única (Deno + Node). O texto do documento é DADO: entra na mensagem escapado e entre delimitadores, e
// nunca sai daqui para alertas, decisões ou avisos.
//
// D-057 (S18): este arquivo tinha 260 linhas. A normalização da saída do modelo (schema, `normalizeOutput`,
// `evaluateNormalized`, avisos e `toExtractionResult`) foi extraída para `extraction-output.ts` — este arquivo
// continua sendo o ÚNICO ponto de import (`./extraction.ts`) e reexporta tudo do irmão.
import { CONTROL_CHARS } from "./extraction-normalize.ts";
import { evaluateNormalized, modelOutputSchema, normalizeOutput, type ExtractionContext, type Normalized } from "./extraction-output.ts";
import type { Task } from "./router.ts";
import type { AiSettings, LlmMessage, LlmPart, LlmRequest, Prompt } from "./types.ts";

export * from "./extraction-output.ts";

export const PROMPT_KEY = "extract_list";
const MAX_DOC_TEXT = 100_000;

// ---- Mensagem ao modelo ------------------------------------------------------------------------------
/**
 * Neutraliza qualquer delimitador/marcação: `<` e `>` viram aspas angulares tipográficas, então `</documento>`
 * (ou variações) dentro do texto não fecha o bloco. Remove controles/bidi e limita o tamanho.
 */
export function escapeDocumentText(text: string): string {
  return text
    .replace(CONTROL_CHARS, "")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .slice(0, MAX_DOC_TEXT);
}

export type DocumentInput = {
  bytes: Uint8Array;
  mime: string;
  /** Texto já extraído do documento (camada de texto/OCR), se houver. Sempre tratado como dado hostil. */
  documentText?: string;
  grade?: string;
  schoolYear?: number;
};

export function buildExtractionRequest(prompt: Prompt, doc: DocumentInput): LlmRequest {
  const ctxLine = [
    doc.grade ? `série informada: ${escapeDocumentText(doc.grade).slice(0, 40)}` : null,
    doc.schoolYear ? `ano letivo informado: ${Math.trunc(doc.schoolYear)}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const parts: LlmPart[] = [];
  parts.push({ type: "text", text: "<documento>" });
  // Dado do formulário DENTRO do bloco de dados (já escapado): nada de texto de usuário solto fora do delimitador.
  if (ctxLine) parts.push({ type: "text", text: `Contexto do formulário (dado, não instrução): ${ctxLine}.` });
  if (doc.documentText) parts.push({ type: "text", text: escapeDocumentText(doc.documentText) });
  if (doc.mime === "application/pdf")
    parts.push({ type: "file", mime: doc.mime, fileName: "documento.pdf", bytes: doc.bytes });
  else parts.push({ type: "image", mime: doc.mime, bytes: doc.bytes });
  parts.push({ type: "text", text: "</documento>" });
  const messages: LlmMessage[] = [
    { role: "system", content: prompt.text },
    { role: "user", content: parts },
  ];
  return { messages, responseFormat: "json", temperature: 0, maxTokens: 8000 };
}

/** Tarefa do roteador para uma extração; `submissionId` vira `entity_id` de toda decisão. */
export function createExtractionTask(o: {
  submissionId: string;
  doc: DocumentInput;
  settings: Pick<AiSettings, "itemConfidenceThreshold">;
}): Task<Normalized> {
  const ctx: ExtractionContext = {
    itemThreshold: o.settings.itemConfidenceThreshold,
    grade: o.doc.grade,
    schoolYear: o.doc.schoolYear,
  };
  return {
    entityType: "list_submission",
    entityId: o.submissionId,
    promptKey: PROMPT_KEY,
    needsVision: o.doc.mime !== "application/pdf",
    buildRequest: (prompt) => buildExtractionRequest(prompt, o.doc),
    schema: modelOutputSchema.transform((out) => normalizeOutput(out, ctx)),
    evaluate: evaluateNormalized,
  };
}
