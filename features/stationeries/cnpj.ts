// CNPJ numérico e alfanumérico (IN RFB 2.229/2024): 14 posições [0-9A-Z]; as 12 primeiras podem ter letras e as
// duas últimas (dígitos verificadores) são sempre números. O valor de cada caractere é o código ASCII menos 48
// (0-9 -> 0-9, A -> 17 ... Z -> 42) e os pesos e o módulo 11 são os do CNPJ numérico.

const MASK = /^[0-9A-Za-z./\-\s]+$/;

/** Sem máscara e em caixa alta, sem validar. */
export function cleanCnpj(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function checkDigit(base: readonly number[]): number {
  // pesos 2..9 da direita para a esquerda, reiniciando
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    sum += (base[i] ?? 0) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** CNPJ válido pelos dígitos verificadores; aceita máscara e letras; rejeita caracteres repetidos. */
export function isValidCnpj(input: string): boolean {
  if (!MASK.test(input)) return false;
  const value = cleanCnpj(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(value)) return false;
  if (/^(.)\1{13}$/.test(value)) return false;
  const nums = [...value].map((ch) => ch.charCodeAt(0) - 48);
  if (checkDigit(nums.slice(0, 12)) !== nums[12]) return false;
  return checkDigit(nums.slice(0, 13)) === nums[13];
}

/** 14 caracteres [0-9A-Z] ou `null` se inválido. */
export function normalizeCnpj(input: string): string | null {
  return isValidCnpj(input) ? cleanCnpj(input) : null;
}

export function formatCnpj(value: string): string {
  return value.replace(/^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})([0-9]{2})$/, "$1.$2.$3/$4-$5");
}
