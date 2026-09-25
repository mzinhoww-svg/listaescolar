import { buildPageMetadata } from "@/lib/seo";

type Page = { title: string; description: string; path: string };

export const SITE_PAGES = {
  home: {
    title: "ListaCerta · Lista de material escolar",
    description:
      "Encontre a lista oficial de material da escola, marque o que já tem e compare lojas. Piloto em Cuiabá, MT.",
    path: "/",
  },
  comoFunciona: {
    title: "Como funciona · ListaCerta",
    description: "Da lista oficial à compra certa: encontre a escola, compare lojas e confira item a item.",
    path: "/como-funciona",
  },
  sobre: {
    title: "Sobre · ListaCerta",
    description: "A ListaCerta organiza as listas oficiais de material escolar e ajuda a família a comparar lojas.",
    path: "/sobre",
  },
  termos: {
    title: "Termos de uso · ListaCerta",
    description: "Termos de uso da ListaCerta. Versão preliminar, em revisão jurídica.",
    path: "/termos",
  },
  privacidade: {
    title: "Privacidade · ListaCerta",
    description: "Política de privacidade da ListaCerta. Versão preliminar, em revisão jurídica.",
    path: "/privacidade",
  },
} as const satisfies Record<string, Page>;

export const pageMetadata = (k: keyof typeof SITE_PAGES) => buildPageMetadata(SITE_PAGES[k]);

export const NAV_LINKS = [
  { label: "Para pais", href: "/#pais" },
  { label: "Para escolas", href: "/#escolas" },
  { label: "Como funciona", href: "/#como-funciona" },
  { label: "Perguntas", href: "/#perguntas" },
] as const;

type Item = { title: string; text: string };

export const SITE_COPY = {
  hero: {
    eyebrow: "Volta às aulas",
    title: "A lista da escola, pronta para comprar.",
    lead: "Lista oficial da escola, revisada antes de publicar, e opções de carrinho para você comparar: mais barato, recomendado, menos lojas ou papelaria local.",
    schoolCta: "Sou escola",
    cardTitle: "Escola de exemplo · série de exemplo",
    cardTag: "Lista oficial",
    cardItems: ["Caderno universitário", "Lápis preto", "Borracha macia", "Régua de 30 cm", "Cola bastão"],
    cardFoot: "Mais barato",
    cardPrice: "Preço com origem e data na sua lista",
  },
  parents: {
    id: "pais",
    eyebrow: "Para pais",
    title: "Sem adivinhar item, sem rodar papelaria",
    items: [
      { title: "Lista certa", text: "A lista vem da escola, não de foto no grupo." },
      { title: "Marque o que já tem", text: "Itens de casa saem do carrinho." },
      { title: "Compare lojas", text: "As lojas lado a lado, cada preço com origem e data." },
    ] satisfies Item[],
  },
  schools: {
    id: "escolas",
    eyebrow: "Para escolas",
    title: "Publique uma vez. Pare de responder a mesma dúvida.",
    items: [
      { title: "Envie o PDF", text: "A IA lê os itens, você só revisa." },
      { title: "Link e QR code", text: "Pronto para o grupo de pais e o mural." },
      {
        title: "Sinalização para revisão",
        text: "Avisamos a escola quando um item pode ser de uso coletivo ou exigir marca, para ela revisar. Não é parecer jurídico.",
      },
    ] satisfies Item[],
    cta: "Cadastrar minha escola",
    ctaNote: "Busque sua escola e peça para administrar a página.",
  },
  steps: {
    id: "como-funciona",
    eyebrow: "Como funciona",
    title: "Encontre, compare, confira",
    items: [
      { title: "Encontre a lista", text: "Busque a escola pelo nome ou INEP e marque o que já tem." },
      { title: "Compare", text: "Compare lojas online ou peça orçamento à papelaria do bairro pelo WhatsApp." },
      { title: "Confira", text: "Confira, item a item, tudo o que a escola pediu antes de comprar." },
    ] satisfies Item[],
    channelsTitle: "Onde comprar",
    stationeries: "Papelarias do bairro",
  },
  faq: {
    id: "perguntas",
    eyebrow: "Perguntas",
    title: "Dúvidas frequentes",
    items: [
      { title: "A ListaCerta vende os materiais?", text: "Não. A compra acontece na loja que você escolher." },
      {
        title: "Quanto custa usar?",
        text: "Famílias e escolas não pagam para usar a ListaCerta. Quando você compra por um link de loja, podemos receber comissão; o preço não muda.",
      },
      {
        title: "A lista é mesmo a oficial?",
        text: "Ela é publicada pela escola ou enviada por famílias e revisada antes de ir ao ar. Em caso de dúvida, confirme com a escola.",
      },
      { title: "Minha escola não aparece.", text: "Envie a lista que você recebeu. Revisamos antes de publicar." },
    ] satisfies Item[],
  },
  how: {
    title: "Da lista oficial à compra certa",
    lead: "Três passos, do PDF da escola até o material conferido. Telas ilustrativas, com conteúdo de exemplo.",
    steps: [
      {
        n: "1",
        title: "Encontre",
        text: "Busque a escola e abra a lista oficial da série.",
        screen: { head: "Escola de exemplo · série de exemplo", sub: "Lista oficial", items: ["Caderno universitário", "Lápis preto", "Borracha macia", "Cola bastão"], foot: "Escolha onde comprar: loja online ou papelaria do bairro." },
      },
      {
        n: "2",
        title: "Compare",
        text: "Veja as opções de carrinho e abra a loja que preferir.",
        screen: { head: "Carrinho · Mais barato", sub: "Total da lista", items: ["Loja online A", "Loja online B", "Papelaria do bairro · WhatsApp"], foot: "Preço com origem e data na sua lista. Links de loja: podemos receber comissão; o preço não muda." },
      },
      {
        n: "3",
        title: "Confira",
        text: "Marque cada item conforme chega, sem esquecer nada da lista.",
        screen: { head: "Lista de exemplo", sub: "Conferência item a item", items: ["Caderno universitário", "Lápis preto", "Borracha macia", "Cola bastão"], foot: "Você marca o que já tem e o que já comprou." },
      },
    ],
  },
  about: {
    title: "A lista da escola deixa de ser uma tarefa e vira uma confirmação.",
    stepsTitle: "Como funciona",
    steps: [
      { title: "A escola publica", text: "Lista oficial por série, revisada antes de ir ao ar." },
      { title: "A família encontra", text: "Busca pela escola e marca o que já tem em casa." },
      { title: "A família compara", text: "Opções de carrinho: mais barato, recomendado, menos lojas ou papelaria local." },
    ] satisfies Item[],
    neutral: "A ListaCerta não vende material escolar: organiza, compara e leva você à loja que escolher.",
    origin: "Piloto em Cuiabá · MT.",
  },
} as const;
