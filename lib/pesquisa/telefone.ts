/** DDDs válidos no Brasil (ANATEL). Usado para recusar número com DDD inexistente. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
  49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Mesma forma da checagem em `survey_leads.whatsapp_e164` (supabase/migrations/0700_pesquisa_maes.sql). */
const E164_BR = /^\+55[1-9][0-9]9?[0-9]{8}$/;

/**
 * Normaliza um telefone brasileiro para E.164 (+55DDDNÚMERO).
 * Aceita com ou sem máscara, com ou sem +55/055 na frente.
 * Devolve null se o DDD não existe ou a quantidade de dígitos está errada.
 */
export function normalizeWhatsappBR(input: string): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");

  if (digits.startsWith("0055")) digits = digits.slice(4);
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);

  if (digits.length !== 10 && digits.length !== 11) return null;

  const ddd = Number(digits.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return null;

  const local = digits.slice(2);
  if (local.length === 9 && local[0] !== "9") return null;

  const candidate = `+55${digits}`;
  return E164_BR.test(candidate) ? candidate : null;
}
