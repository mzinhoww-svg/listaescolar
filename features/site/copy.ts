import { buildPageMetadata } from "@/lib/seo";

type Page = { title: string; description: string; path: string };

export const SITE_PAGES = {
  home: {
    title: "ListaCerta · Lista de material escolar",
    description:
      "Encontre a lista oficial de material da escola e peça o preço à papelaria do bairro. Piloto em Cuiabá, MT.",
    path: "/",
  },
  comoFunciona: {
    title: "Como funciona · ListaCerta",
    description: "Da lista oficial à compra certa: encontre a escola, veja a lista item a item e peça o preço à papelaria do bairro.",
    path: "/como-funciona",
  },
  sobre: {
    title: "Sobre · ListaCerta",
    description: "A ListaCerta organiza as listas oficiais de material escolar e ajuda a família a pedir preço à papelaria do bairro.",
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

type Item = { title: string; text: string; action?: { label: string; href: string } };

export const SITE_COPY = {
  hero: {
    eyebrow: "Volta às aulas",
    title: "A lista da escola, pronta para comprar.",
    lead: "Lista oficial da escola, revisada antes de publicar, e o pedido de preço à papelaria do bairro. Quando houver preço de loja, você compara as opções de carrinho.",
    scope: "Piloto em Cuiabá, MT",
    schoolCta: "Sou escola",
    stationeryCta: "Sou papelaria",
    cardTitle: "Escola de exemplo · série de exemplo",
    cardTag: "Lista oficial",
    cardItems: ["Caderno universitário", "Lápis preto", "Borracha macia", "Régua de 30 cm", "Cola bastão"],
    cardFoot: "Pedir preço à papelaria do bairro",
    cardPrice: "Sem preço aqui: ele aparece quando a papelaria ou a loja informa.",
  },
  parents: {
    id: "pais",
    eyebrow: "Para pais",
    title: "Sem adivinhar item, sem rodar papelaria",
    items: [
      { title: "Lista certa", text: "A lista vem da escola, não de foto no grupo." },
      { title: "Veja item a item", text: "A lista oficial da escola, com cada item e a quantidade pedida." },
      { title: "Peça o preço", text: "Peça a cotação à papelaria do bairro pelo WhatsApp. Quando houver preço de loja, compare as opções de carrinho; cada preço com origem e data." },
    ] satisfies Item[],
  },
  schools: {
    id: "escolas",
    eyebrow: "Para escolas",
    title: "Publique uma vez. Pare de responder a mesma dúvida.",
    items: [
      { title: "Envie o PDF", text: "Você envia o PDF da lista; os itens são lidos e revisados antes de a lista ir ao ar." },
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
    title: "Encontre, peça o preço, confira",
    items: [
      { title: "Encontre a lista", text: "Busque a escola pelo nome ou pelo código INEP (o número da escola no Censo Escolar) e abra a lista oficial da série." },
      { title: "Peça o preço", text: "Faça o pedido de cotação à papelaria do bairro pelo WhatsApp. Quando houver preço de loja online, você compara as opções de carrinho." },
      { title: "Confira", text: "Veja a lista oficial item a item e confira o que a escola pediu antes de comprar." },
    ] satisfies Item[],
    channelsTitle: "Onde comprar",
    onlineStores: "Lojas online",
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
      {
        title: "Minha escola não aparece.",
        text: "Envie a lista que você recebeu. Revisamos antes de publicar.",
        action: { label: "Enviar a lista da escola", href: "/enviar-lista" },
      },
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
        title: "Peça o preço",
        text: "Peça a cotação à papelaria do bairro; com preço de loja, veja as opções de carrinho.",
        screen: { head: "Cotação · Papelaria do bairro", sub: "Pedido pelo WhatsApp", items: ["Escolha a papelaria do bairro", "Envie o pedido pelo WhatsApp", "A papelaria informa o preço"], foot: "Quando houver preço de loja, aparecem as opções de carrinho, com origem e data. Links de loja: podemos receber comissão; o preço não muda." },
      },
      {
        n: "3",
        title: "Confira",
        text: "Volte à lista oficial e confira, item a item, o que a escola pediu.",
        screen: { head: "Lista de exemplo", sub: "Lista oficial, item a item", items: ["Caderno universitário", "Lápis preto", "Borracha macia", "Cola bastão"], foot: "Cada item com a quantidade pedida pela escola." },
      },
    ],
  },
  about: {
    title: "A lista da escola deixa de ser uma tarefa e vira uma confirmação.",
    stepsTitle: "Como funciona",
    steps: [
      { title: "A escola publica", text: "Lista oficial por série, revisada antes de ir ao ar." },
      { title: "A família encontra", text: "Busca pela escola e abre a lista oficial da série." },
      { title: "A família pede o preço", text: "Cotação com a papelaria do bairro e, quando houver preço de loja, opções de carrinho." },
    ] satisfies Item[],
    neutral: "A ListaCerta não vende material escolar: organiza a lista, ajuda a pedir preço e leva você à loja que escolher.",
      },
} as const;
