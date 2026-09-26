/**
 * Máscara visual `(65) 99999-9999`. Puramente de exibição: a validação de verdade
 * (DDD, formato E.164) acontece no servidor, em `/api/pesquisa/lead`.
 */
export function mascararWhatsApp(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  const meio = resto.slice(0, 5);
  const fim = resto.slice(5, 9);
  let saida = ddd ? `(${ddd}` : "";
  if (ddd.length === 2) saida += ") ";
  saida += meio;
  if (fim) saida += `-${fim}`;
  return saida;
}

export function whatsAppMascaraCompleta(valor: string): boolean {
  return valor.replace(/\D/g, "").length === 11;
}
