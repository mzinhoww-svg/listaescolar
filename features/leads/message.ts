import { z } from "zod";

import { whatsappLink } from "@/features/stationeries/whatsapp";

import { LEAD_CODE_PATTERN } from "./code";
import { LeadError } from "./errors";

// Controle, quebras de linha, separadores Unicode e formatação invisível (inclui bidi): viram espaço ANTES da
// remoção de dados pessoais, para não juntar dígitos separados por uma quebra.
const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const URL_LIKE = /(?:https?:\/\/|www\.)\S+/gi;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g;
const PHONE = /\+?\d(?:[\s().-]{0,2}\d){7,}/g;

/** Texto livre do snapshot (nome da escola, série) sem controle, e-mail, CPF nem telefone; tamanho limitado. */
export function cleanLeadText(value: string, max: number): string {
  return value
    .normalize("NFC")
    .replace(CONTROL, " ")
    .replace(URL_LIKE, " ")
    .replace(EMAIL, " ")
    .replace(CPF, " ")
    .replace(PHONE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const cleanField = (max: number) =>
  z
    .string()
    .max(2000)
    .transform((v) => cleanLeadText(v, max))
    .refine((v) => v !== "", "Campo vazio.");

/** Só estes campos entram na mensagem. `strictObject`: qualquer campo extra (perfil, estudante, e-mail) é recusado. */
export const LeadMessageInputSchema = z.strictObject({
  code: z.string().refine((c) => LEAD_CODE_PATTERN.test(c), "Código inválido."),
  schoolName: cleanField(120),
  gradeLabel: cleanField(60),
  schoolYear: z.number().int().min(2000).max(2100),
  listUrl: z.string().max(300),
});
export type LeadMessageInput = z.input<typeof LeadMessageInputSchema>;

export type LeadMessageOptions = { siteOrigin?: string };

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** `https://<site>/papelaria/leads/<code>`: única forma aceita para o link da lista (sem query, âncora nem credenciais). */
function listUrlIsValid(code: string, listUrl: string, siteOrigin?: string): boolean {
  let url: URL;
  try {
    url = new URL(listUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) return false;
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return false;
  if (url.pathname !== `/papelaria/leads/${code}`) return false;
  if (siteOrigin !== undefined && url.origin !== new URL(siteOrigin).origin) return false;
  return true;
}

/** Link da lista do lead no painel da papelaria, só com a origem do PRÓPRIO site. */
export function leadListUrl(siteOrigin: string, code: string): string {
  if (!LEAD_CODE_PATTERN.test(code)) throw new LeadError("código inválido", "invalid_input");
  let origin: string;
  try {
    origin = new URL(siteOrigin).origin;
  } catch {
    throw new LeadError("origem do site inválida", "invalid_input");
  }
  return `${origin}/papelaria/leads/${code}`;
}

/**
 * Texto pré-preenchido do WhatsApp: código, escola, série, ano e link da lista. Nada do responsável nem de estudante.
 * Lança `LeadError(invalid_input)` com entrada inválida (campo extra, vazio, link fora do site).
 */
export function buildLeadMessage(input: LeadMessageInput, options: LeadMessageOptions = {}): string {
  const parsed = LeadMessageInputSchema.safeParse(input);
  if (!parsed.success) throw new LeadError("dados da mensagem inválidos", "invalid_input");
  const { code, schoolName, gradeLabel, schoolYear, listUrl } = parsed.data;
  if (!listUrlIsValid(code, listUrl, options.siteOrigin)) throw new LeadError("link da lista inválido", "invalid_input");
  return [
    "Olá! Vim pela ListaCerta e gostaria de uma cotação da lista de material escolar.",
    `Código: ${code}`,
    `Escola: ${schoolName}`,
    `Série: ${gradeLabel} (${schoolYear})`,
    `Lista: ${listUrl}`,
  ].join("\n");
}

/**
 * `https://wa.me/<número da papelaria>?text=<mensagem>` ou `null`. O número é normalizado (só dígitos E.164) e a URL
 * final é conferida: host `wa.me`, caminho só de dígitos, único parâmetro `text`.
 */
export function buildLeadWhatsappUrl(stationeryWhatsapp: string, input: LeadMessageInput, options: LeadMessageOptions = {}): string | null {
  let text: string;
  try {
    text = buildLeadMessage(input, options);
  } catch {
    return null;
  }
  const link = whatsappLink(stationeryWhatsapp, text);
  if (!link) return null;
  try {
    const url = new URL(link);
    const keys = [...url.searchParams.keys()];
    if (url.protocol !== "https:" || url.host !== "wa.me" || !/^\/\d{12,13}$/.test(url.pathname)) return null;
    if (keys.length !== 1 || keys[0] !== "text" || url.hash !== "" || url.username !== "" || url.password !== "") return null;
  } catch {
    return null;
  }
  return link;
}
