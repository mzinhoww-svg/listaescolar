/** Telefone brasileiro em E.164 (`+55DDNNNNNNNN[N]`), como o banco exige, ou `null`. */
export function normalizePhone(input: string): string | null {
  if (!/^[\d\s()+\-.]+$/.test(input)) return null;
  let digits = input.replace(/\D/g, "");
  const international = input.trim().startsWith("+");
  if (international && !digits.startsWith("55")) return null;
  // zero de tronco ("0 65 99999-8888"): DDD nunca começa com zero, então o zero inicial é descartado.
  if (!international && digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99 || digits[1] === "0") return null;
  const first = digits[2] ?? "";
  if (digits.length === 11 && first !== "9") return null; // celular
  if (digits.length === 10 && !/[2-5]/.test(first)) return null; // fixo
  return `+55${digits}`;
}

/** WhatsApp: mesmo formato do telefone (fixo com WhatsApp Business é aceito). */
export const normalizeWhatsapp = normalizePhone;

/** CEP com 8 dígitos ou `null`. */
export function normalizeCep(input: string): string | null {
  if (!/^\d{5}-?\d{3}$/.test(input.trim())) return null;
  const digits = input.replace(/\D/g, "");
  return digits === "00000000" ? null : digits;
}
