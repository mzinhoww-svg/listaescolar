/**
 * Auxiliares do roteiro E2E da S27 (scripts/e2e-s27.sh). Sem rede, sem banco.
 *   code <inep> [slug]     código curto do link
 *   qr <arquivo.svg>       decodifica o QR do SVG (rasteriza o atributo `d`) e imprime a URL
 *   scan <arquivo.html>    varredura de claims sobre o texto visível; sai 1 se achar algo
 *   contrast               pares de cor da marca com razão de contraste WCAG; sai 1 se algum par < mínimo
 */
import { readFileSync } from "node:fs";

import jsQR from "jsqr";

import { encodeShortCode } from "../features/short-links/code";

const [cmd, a, b] = process.argv.slice(2);

function decodeQr(svg: string): string {
  const scale = 4;
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  const d = /<path [^>]*d="([^"]+)"/.exec(svg)?.[1] ?? "";
  const side = n * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < w * scale; dx++) {
        const i = ((y * scale + dy) * side + x * scale + dx) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
  }
  return jsQR(data, side, side)?.data ?? "";
}

const NUM_WORD = "um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|cem|cento|meia";
const COST_SENTENCE = "Famílias e escolas não pagam para usar a ListaCerta.";
const PROIBIDOS: [string, RegExp][] = [
  ["número com unidade", /\d+\s*(mil|escolas|famílias|%|minutos|dias|horas)/i],
  ["número por extenso", new RegExp(`\\b(${NUM_WORD})\\s+(mil|escolas|famílias|lojas|papelarias|itens|minutos|dias|horas|segundos)\\b`, "i")],
  ["quantidade vaga", /milhares|dezenas|centenas|\bmil\b/i],
  ["preço em reais", /R\$/],
  ["gratuidade", /gr[aá]tis|gratuit|sem custo|de graça/i],
  ["economia", /economi[zs]|\bdesconto/i],
  ["velocidade", /mais r[aá]pid|rapidez|em segundos|em minutos/i],
  ["validação", /validad|verificad|homologad/i],
  // Magalu/Kalunga/Amazon aparecem só como nomes de lojas vindos da tabela `retailers` ("Onde comprar"); Procon e a lei ficam proibidos.
  ["órgão/lei", /Procon|12\.886/i],
  ["entrega", /entrega|receba em casa|entregue/i],
  ["parceria", /parceir/i],
  ["conformidade", /conformidade|compliant|certificad|garantimos|100% seguro|de acordo com a LGPD|cumpre a LGPD/i],
];

function visibleText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

function lum(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}
function blend(fg: string, bg: string, alpha: number): string {
  const ch = (i: number) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha));
  return `#${[1, 3, 5].map((i) => ch(i).toString(16).padStart(2, "0")).join("")}`;
}
const ratio = (x: string, y: string) => {
  const [hi, lo] = [Math.max(lum(x), lum(y)), Math.min(lum(x), lum(y))];
  return (hi + 0.05) / (lo + 0.05);
};

if (cmd === "code" && a) {
  console.log(encodeShortCode({ inep: a, gradeSlug: b ?? null }));
} else if (cmd === "qr" && a) {
  console.log(decodeQr(readFileSync(a, "utf8")));
} else if (cmd === "scan" && a) {
  const text = visibleText(readFileSync(a, "utf8")).replaceAll(COST_SENTENCE, "");
  const hits = PROIBIDOS.filter(([, re]) => re.test(text)).map(([name]) => name);
  if (hits.length > 0) {
    console.log(`claims proibidas: ${hits.join(", ")}`);
    process.exit(1);
  }
  console.log("ok");
} else if (cmd === "contrast") {
  const T = { tinta: "#0f1b2d", papel: "#f5f2ea", branco: "#ffffff", texto2: "#3a4658", texto3: "#5a6575", verdeFundo: "#0b6b4a", verdeCerto: "#2fcb86" };
  const pairs: [string, string, string, number][] = [
    ["tinta / papel (corpo)", T.tinta, T.papel, 4.5],
    ["tinta / branco", T.tinta, T.branco, 4.5],
    ["texto-2 / papel", T.texto2, T.papel, 4.5],
    ["texto-3 / papel", T.texto3, T.papel, 4.5],
    ["texto-3 / branco", T.texto3, T.branco, 4.5],
    ["verde-fundo / papel (links)", T.verdeFundo, T.papel, 4.5],
    ["verde-fundo / branco", T.verdeFundo, T.branco, 4.5],
    ["papel / tinta (rodapé, botão)", T.papel, T.tinta, 4.5],
    ["papel 85% / tinta", blend(T.papel, T.tinta, 0.85), T.tinta, 4.5],
    ["verde-certo / tinta (destaque)", T.verdeCerto, T.tinta, 4.5],
    ["tinta / verde-certo (botão)", T.tinta, T.verdeCerto, 4.5],
    ["papel / verde-fundo (botão)", T.papel, T.verdeFundo, 4.5],
    ["aviso-texto / aviso-fundo", "#7a4a00", "#fde9cc", 4.5],
    ["demo-texto / demo-fundo (selo)", "#5c4700", "#fff0b8", 4.5],
    ["anel de foco verde-fundo / papel (não texto)", T.verdeFundo, T.papel, 3],
  ];
  let bad = 0;
  for (const [name, fg, bg, min] of pairs) {
    const r = ratio(fg, bg);
    if (r < min) bad++;
    console.log(`${r < min ? "FAIL" : "ok  "} ${r.toFixed(2)}:1 (mín ${min}) ${name}`);
  }
  process.exit(bad === 0 ? 0 : 1);
} else {
  console.error("uso: code <inep> [slug] | qr <svg> | scan <html> | contrast");
  process.exit(2);
}
