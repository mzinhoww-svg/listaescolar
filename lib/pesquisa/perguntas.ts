export type Opcao = { readonly slug: string; readonly rotulo: string };

export const CIDADE = [
  { slug: "cuiaba", rotulo: "Cuiabá" },
  { slug: "varzea_grande", rotulo: "Várzea Grande" },
  { slug: "outra", rotulo: "Outra cidade" },
] as const satisfies readonly Opcao[];

export const FILHOS = [
  { slug: "1", rotulo: "1" },
  { slug: "2", rotulo: "2" },
  { slug: "3_ou_mais", rotulo: "3 ou mais" },
] as const satisfies readonly Opcao[];

export const REDE = [
  { slug: "particular", rotulo: "Particular" },
  { slug: "publica", rotulo: "Pública" },
  { slug: "ambas", rotulo: "Tenho nas duas" },
] as const satisfies readonly Opcao[];

export const ETAPAS = [
  { slug: "infantil", rotulo: "Educação infantil" },
  { slug: "fundamental_1", rotulo: "Fundamental 1 (1º ao 5º)" },
  { slug: "fundamental_2", rotulo: "Fundamental 2 (6º ao 9º)" },
  { slug: "medio", rotulo: "Ensino médio" },
] as const satisfies readonly Opcao[];

export const RECEBIMENTO = [
  { slug: "papel_impresso", rotulo: "Papel impresso" },
  { slug: "foto_pdf_whatsapp", rotulo: "Foto ou PDF no WhatsApp" },
  { slug: "site_app_escola", rotulo: "Site ou app da escola" },
  { slug: "outro", rotulo: "Outro jeito" },
] as const satisfies readonly Opcao[];

export const ONDE_COMPROU = [
  { slug: "papelaria_bairro", rotulo: "Papelaria do bairro" },
  { slug: "loja_grande", rotulo: "Loja grande (Kalunga e similares)" },
  { slug: "internet", rotulo: "Internet" },
  { slug: "supermercado", rotulo: "Supermercado" },
  { slug: "kit_escola", rotulo: "Kit vendido pela escola" },
  { slug: "outro", rotulo: "Outro" },
] as const satisfies readonly Opcao[];

export const GASTO = [
  { slug: "ate_200", rotulo: "Até R$ 200" },
  { slug: "200_a_400", rotulo: "R$ 200 a 400" },
  { slug: "400_a_600", rotulo: "R$ 400 a 600" },
  { slug: "mais_de_600", rotulo: "Mais de R$ 600" },
  { slug: "nao_lembro", rotulo: "Não lembro" },
] as const satisfies readonly Opcao[];

export const TEMPO = [
  { slug: "ate_1_hora", rotulo: "Até 1 hora" },
  { slug: "1_a_3_horas", rotulo: "De 1 a 3 horas" },
  { slug: "meio_dia", rotulo: "Meio dia" },
  { slug: "mais_de_um_dia", rotulo: "Mais de um dia" },
] as const satisfies readonly Opcao[];

export const COMPAROU = [
  { slug: "sim_varias_lojas", rotulo: "Sim, em várias lojas" },
  { slug: "um_pouco", rotulo: "Um pouco" },
  { slug: "nao_comparei", rotulo: "Não comparei" },
] as const satisfies readonly Opcao[];

export const DORES = [
  { slug: "preco_alto", rotulo: "Preço alto" },
  { slug: "achar_itens", rotulo: "Achar todos os itens" },
  { slug: "entender_item_marca", rotulo: "Entender o item ou a marca pedida" },
  { slug: "ir_ate_loja", rotulo: "Ir até a loja" },
  { slug: "comprar_item_errado", rotulo: "Comprar item errado" },
  { slug: "falta_tempo", rotulo: "Falta de tempo" },
] as const satisfies readonly Opcao[];
export const DORES_MAX_SELECIONADAS = 2;

export const USARIA = [
  { slug: "com_certeza", rotulo: "Com certeza" },
  { slug: "talvez", rotulo: "Talvez" },
  { slug: "nao", rotulo: "Não" },
] as const satisfies readonly Opcao[];

export const CANAL = [
  { slug: "internet_entrega", rotulo: "Internet, com entrega em casa" },
  { slug: "papelaria_whatsapp", rotulo: "Papelaria do bairro, pelo WhatsApp" },
  { slug: "tanto_faz", rotulo: "Tanto faz" },
] as const satisfies readonly Opcao[];

export const ESCOLA_MAX_LENGTH = 120;
export const COMPRA_IDEAL_MAX_LENGTH = 500;

export const ULTIMO_STEP = 12;

/** ids de campo válidos por step (1-based). Usado para rejeitar id de outra tela. */
export const CAMPOS_POR_STEP: Readonly<Record<number, readonly string[]>> = {
  1: ["cidade"],
  2: ["filhos"],
  3: ["rede"],
  4: ["escola", "etapas"],
  5: ["recebimento"],
  6: ["onde_comprou"],
  7: ["gasto"],
  8: ["tempo"],
  9: ["comparou"],
  10: ["dores"],
  11: ["usaria", "canal"],
  12: ["compra_ideal", "pode_citar"],
};

/** step (1-based) requer pelo menos um campo -- "Pular" (answers: {}) só é válido quando false. */
export const STEP_TOTALMENTE_OPCIONAL: Readonly<Record<number, boolean>> = {
  1: false,
  2: false,
  3: false,
  4: false,
  5: false,
  6: false,
  7: false,
  8: false,
  9: false,
  10: false,
  11: false,
  12: true,
};

export function isStepValido(step: number): step is 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 {
  return Number.isInteger(step) && step >= 1 && step <= ULTIMO_STEP;
}
