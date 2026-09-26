// Varredura de vazamento (S24, Global Constraints, teste de aceite "nenhuma rota devolve dado pessoal"): percorre
// recursivamente um corpo de resposta (dado ou erro) procurando CHAVES proibidas (lista fixa + regex) e VALORES
// proibidos (strings semeadas nos testes: e-mail, telefone, CPF, UUIDs de perfil/envio/versão/item, nome de aluno,
// apelido, código `LC-`), além de regex genéricas de e-mail/CPF/telefone sobre qualquer string. Puro: só lê o JSON
// já desserializado, nunca toca rede ou banco.

export type Finding = { path: string; reason: "key" | "value"; match: string };

export type ScanOptions = {
  /** Chaves proibidas adicionais (exatas), além da regex padrão. */
  keys?: readonly string[];
  /** Strings proibidas (comparação por `includes`): e-mails, telefones, CPFs, UUIDs semeados, nomes, códigos. */
  values?: readonly string[];
  /** Chaves do próprio contrato que bateriam na regex mas são explicitamente permitidas (allowlist mínima). */
  allowKeys?: readonly string[];
};

// Lista fixa (Global Constraints) + regex. Case-insensitive; olha o NOME da chave, não o valor.
const FORBIDDEN_KEY_REGEX =
  /(e-?mail|phone|telefone|cpf|address|endereco|cep|profile|user_id|actor|requester|owner|created_by|approved_by|submitted_by|alerts?|confidence|submission|publication_|source)/i;

const FORBIDDEN_KEY_EXACT = new Set([
  "email", "phone", "address", "cep", "profile_id", "actor_id", "requester_id", "owner_id",
  "created_by", "approved_by", "submitted_by", "alerts", "confidence", "source", "submission_id",
  "publication_key", "publication_hash", "registry_source", "source_batch_id", "current_version_id",
]);

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/;
// Celular BR: DDD opcional + 9 (celular sempre começa com 9) + 8 dígitos, com \b nas pontas para não pegar um
// trecho de UUID ou de outro número maior (heurística: nem toda sequência com "9" no meio é telefone, mas é
// suficiente para o teste de vazamento, que semeia telefones de verdade nos dados sensíveis).
const PHONE_BR_REGEX = /\b(\+?55\s?)?\(?\d{2}\)?[\s.-]?9\d{4}[\s.-]?\d{4}\b/;

function joinPath(base: string, next: string): string {
  return base ? `${base}.${next}` : next;
}

export function scanForForbidden(json: unknown, opts: ScanOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const allow = new Set(opts.allowKeys ?? []);
  const extraKeys = new Set(opts.keys ?? []);
  const extraValues = (opts.values ?? []).filter((v) => v.length > 0);

  function visitString(value: string, path: string): void {
    for (const forbidden of extraValues) {
      if (value.includes(forbidden)) findings.push({ path, reason: "value", match: forbidden });
    }
    if (EMAIL_REGEX.test(value)) findings.push({ path, reason: "value", match: "email" });
    if (CPF_REGEX.test(value)) findings.push({ path, reason: "value", match: "cpf" });
    if (PHONE_BR_REGEX.test(value) && /\d{4}/.test(value)) findings.push({ path, reason: "value", match: "telefone" });
  }

  function visit(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const childPath = joinPath(path, key);
        if (!allow.has(key) && (FORBIDDEN_KEY_EXACT.has(key) || extraKeys.has(key) || FORBIDDEN_KEY_REGEX.test(key))) {
          findings.push({ path: childPath, reason: "key", match: key });
        }
        visit(value, childPath);
      }
      return;
    }
    if (typeof node === "string") visitString(node, path);
  }

  visit(json, "");
  return findings;
}
