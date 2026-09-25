/** Só dígitos. */
export function cnpjDigits(input: string): string {
  return input.replace(/\D/g, "");
}

function checkDigit(base: number[]): number {
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

/** CNPJ válido pelos dígitos verificadores; aceita máscara; rejeita sequências repetidas. */
export function isValidCnpj(input: string): boolean {
  if (!/^[\d./\-\s]+$/.test(input)) return false;
  const digits = cnpjDigits(input);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const nums = [...digits].map(Number);
  const d1 = checkDigit(nums.slice(0, 12));
  if (d1 !== nums[12]) return false;
  return checkDigit(nums.slice(0, 13)) === nums[13];
}

/** 14 dígitos ou `null` se inválido. */
export function normalizeCnpj(input: string): string | null {
  return isValidCnpj(input) ? cnpjDigits(input) : null;
}

export function formatCnpj(digits: string): string {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
