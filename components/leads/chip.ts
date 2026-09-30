/** Chip de filtro (Entrega, Retirada): selecionado em Tinta (Verde Certo não é cor de estado selecionado nem de botão), alvo de 44 px. */
export const chipClass = (on: boolean): string =>
  `${on ? "bg-tinta text-papel" : "bg-campo text-tinta"} focus-visible:outline-verde-fundo rounded-botao inline-flex min-h-11 items-center px-4 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2`;
