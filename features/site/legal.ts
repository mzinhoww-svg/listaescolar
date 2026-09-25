/** Dados jurídicos ainda não definidos: `null` vira placeholder visível. Editado pela S17 e pelo jurídico. */
export type Legal = {
  companyName: string | null;
  cnpj: string | null;
  dpoEmail: string | null;
  contactEmail: string | null;
  retention: string | null;
  lastUpdated: string | null;
};

export const LEGAL: Legal = {
  companyName: null,
  cnpj: null,
  dpoEmail: null,
  contactEmail: null,
  retention: null,
  lastUpdated: null,
};

export const PRELIMINARY_BANNER = "Versão preliminar. Texto em revisão jurídica.";

export type Part = string | { key: keyof Legal; label: string };
export type LegalSection = { title: string; paragraphs: Part[][] };

const dpo: Part = { key: "dpoEmail", label: "e-mail do encarregado de dados" };

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "O serviço",
    paragraphs: [["A ListaCerta mostra a lista oficial da escola e compara preços em lojas. Não vende material escolar."]],
  },
  {
    title: "Listas",
    paragraphs: [["Listas publicadas pela escola ou revisadas pelo nosso time. Confira sempre com a escola em caso de dúvida."]],
  },
  {
    title: "Compras",
    paragraphs: [["A compra acontece na loja escolhida, com as regras dela."]],
  },
  {
    title: "Links de loja",
    paragraphs: [["Ao comprar por um link de loja, podemos receber comissão das lojas; o preço não muda para você."]],
  },
  {
    title: "Conta",
    paragraphs: [["Você é responsável pelo acesso à sua conta, por e-mail ou conta Google."]],
  },
  { title: "Dúvidas", paragraphs: [["Fale com o encarregado de dados: ", dpo, "."]] },
  { title: "Última atualização", paragraphs: [[{ key: "lastUpdated", label: "data da última atualização" }]] },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "Quem somos",
    paragraphs: [
      [{ key: "companyName", label: "razão social" }, ", CNPJ ", { key: "cnpj", label: "CNPJ" }, ", responsável pelos dados tratados neste site."],
    ],
  },
  {
    title: "Dados que coletamos",
    paragraphs: [
      ["Nome e e-mail da conta (e-mail ou conta Google), cidade e escola. Do estudante, guardamos apenas apelido e série. Não pedimos documento nem nome completo."],
    ],
  },
  {
    title: "Dados de crianças",
    paragraphs: [["Não coletamos dado de criança além de apelido e série, informados pelo responsável para montar a lista escolar."]],
  },
  {
    title: "Por quanto tempo",
    paragraphs: [["Prazo de retenção: ", { key: "retention", label: "prazo de retenção" }, "."]],
  },
  {
    title: "Seus direitos",
    paragraphs: [["Para pedir acesso, correção ou exclusão dos seus dados, fale com o encarregado: ", dpo, "."]],
  },
  {
    title: "Última atualização",
    paragraphs: [[{ key: "lastUpdated", label: "data da última atualização" }]],
  },
];
