/**
 * Rótulo seguro de um erro para `console.error` (reverificação S19): só `code`/`name`, nunca o objeto inteiro.
 * `PostgrestError.details` pode trazer a linha ofensora (ex.: CNPJ de uma violação de unicidade) e o log da Vercel
 * não é lugar de dado pessoal.
 */
export function safeErrorLabel(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return "erro";
}
