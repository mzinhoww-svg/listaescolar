---
name: design-intelligence
description: >
  Inteligencia de design de alto nivel para qualquer decisao visual: sistemas de design, paletas,
  tipografia, hierarquia visual, espacamento, acessibilidade, estilo por industria e UX patterns.
  Usa o repositorio Awesome Design MD (https://github.com/VoltAgent/awesome-design-md) como banco
  de referencia de DESIGN.md de produtos reais, combinando com principios avancados de UI/UX.
  Ative SEMPRE que o usuario pedir: "qual estilo usar", "qual paleta combina", "como estruturar
  essa UI", "revisa meu design", "melhora essa interface", "que fonte usar", "design system",
  "componente com identidade visual", "UX de landing page", "hierarquia visual", "dark mode",
  "acessibilidade", "design para fintech / SaaS / loyalty", "cria um DESIGN.md", ou qualquer
  decisao visual antes de codar. Substitui e supera a skill ui-ux-pro-max. Combine com
  tripled-ui para gerar codigo depois das decisoes de design.
---

# Design Intelligence Skill

Repositorio de referencia: **https://github.com/VoltAgent/awesome-design-md**

## O que e o Awesome Design MD

Colecao de arquivos `DESIGN.md` que capturam sistemas de design de produtos reais (Stripe, Linear,
Vercel, Notion, Figma, etc.). Cada DESIGN.md e um documento estruturado com:

- Paleta de cores exata (hex)
- Tipografia (fontes, pesos, tamanhos)
- Espacamento e grid
- Padroes de componentes
- Principios visuais da marca
- Tom e personalidade

**Uso principal**: jogar um DESIGN.md no contexto e o agente gera UI identica ao produto referenciado.

## Workflow de design

### Fase 1 — Briefing rapido

Antes de qualquer decisao visual, identificar:

```
1. Tipo de produto: SaaS / E-commerce / Loyalty / Fintech / Portfolio / Marketplace
2. Publico: B2B executivo / B2C jovem / corporativo / startups
3. Personalidade: minimalista / bold / tecnico / premium / playful / trust
4. Stack: React / HTML / Next.js / mobile
5. Restricoes de marca: cores existentes, fontes aprovadas
```

### Fase 2 — Selecionar referencia no Awesome Design MD

Mapear o produto mais proximo ao que se quer construir:

| Referencia | Melhor para |
|---|---|
| Stripe | Fintech, pagamentos, SaaS B2B premium |
| Linear | SaaS de produtividade, dark mode, dev tools |
| Vercel | Developer tools, plataformas tecnicas |
| Notion | Workspaces, colaboracao, docs |
| Figma | Design tools, criativo, colorido |
| Loom | Video, SaaS growth, landing moderno |

Buscar o DESIGN.md correspondente em:
`https://github.com/VoltAgent/awesome-design-md/tree/main/design-md`

### Fase 3 — Gerar sistema de design

Produzir um bloco de decisoes antes de qualquer codigo:

```markdown
## Sistema de Design — [Nome do Projeto]

### Paleta
- Primary: #[hex] — botoes, links, destaques
- Background: #[hex] — fundo geral
- Surface: #[hex] — cards, modals
- Text Primary: #[hex] — titulos
- Text Secondary: #[hex] — descricoes, labels
- Border: #[hex] — divisores, outlines
- Accent: #[hex] — badges, highlights

### Tipografia
- Display: [Fonte] — peso 700-800 — titulos H1/H2
- Body: [Fonte] — peso 400-500 — texto corrido
- Mono: [Fonte] — codigo, dados numericos
- Escala: 12 / 14 / 16 / 20 / 24 / 32 / 48 / 64px

### Espacamento
- Base unit: 4px
- Secoes: 80-120px vertical
- Cards: 24-32px padding
- Gap entre elementos: 16-24px

### Bordas e Sombras
- Radius: 8px (padrao) / 12px (cards) / 20px (modals) / 9999px (pills)
- Shadow sm: 0 1px 3px rgba(0,0,0,0.12)
- Shadow md: 0 4px 16px rgba(0,0,0,0.16)
- Shadow lg: 0 16px 48px rgba(0,0,0,0.20)

### Estilo visual
- [Minimalista / Glassmorphism / Bold / Premium / etc.]
- Densidade: [Compacta / Confortavel / Espaçosa]
- Motion: [Sutil / Expressivo / Sem animacao]
```

### Fase 4 — Validacao UX

Checklist antes de entregar qualquer UI:

**Acessibilidade (CRITICO)**
- [ ] Contraste texto/fundo >= 4.5:1 (WCAG AA)
- [ ] Contraste elementos grandes >= 3:1
- [ ] Alvos de toque >= 44x44px
- [ ] Focus visible em todos inputs e botoes
- [ ] Alt text em imagens informativas

**Hierarquia visual**
- [ ] 1 elemento dominante por secao (tamanho, cor ou peso)
- [ ] No maximo 2 fontes por projeto
- [ ] No maximo 3 pesos por fonte
- [ ] Espacamento consistente com escala de 4px

**Performance**
- [ ] Imagens em WebP com lazy loading
- [ ] Fontes com `font-display: swap`
- [ ] Sem layout shift em carregamento (CLS)
- [ ] Animacoes respeitam `prefers-reduced-motion`

**Mobile first**
- [ ] Layout fluido de 320px ate 1440px
- [ ] Navegacao acessivel em touch
- [ ] Texto legivel sem zoom (>= 16px body)

## Estilos por industria

### Loyalty / Fidelidade (LATAM Pass context)
```
Personalidade: Premium, confianca, viagem, aspiracional
Paleta: Navy escuro + dourado/gold + branco limpo
Tipografia: Geometrica sans (DM Sans, Plus Jakarta) peso 600-700 nos titulos
Espacamento: Generoso — seccoes respiram
Motion: Suave, elegante — nunca agressivo
Componentes chave: Cards de milhas, progress bars, badges de status, tabelas comparativas
Evitar: Neon, tipografia muito playful, backgrounds poluidos
```

### Fintech / Pagamentos
```
Personalidade: Seguranca, velocidade, clareza
Paleta: Azul profundo + branco + verde de sucesso
Tipografia: Sans-serif geometrica — Inter, DM Sans
Componentes chave: Formularios de pagamento, status de transacao, dashboards de saldo
Evitar: Sombras excessivas, cores quentes no CTA primario
```

### SaaS B2B
```
Personalidade: Produtividade, confianca, precision
Paleta: Escala de cinzas + 1 cor de marca vibrante
Tipografia: Inter, Geist — peso medio
Componentes chave: Tabelas de dados, sidebars, modals, notificacoes
Evitar: Designs muito "agencia" ou decorativos demais
```

### SaaS B2C / Consumer
```
Personalidade: Amigavel, acessivel, moderno
Paleta: Cores mais saturadas, gradientes suaves
Tipografia: Rounded ou humanista — Nunito, DM Sans
Componentes chave: Cards visuais, onboarding steps, empty states criativos
```

## DESIGN.md template

Quando o usuario pedir para criar um DESIGN.md para o projeto dele, usar este template:

```markdown
# DESIGN.md — [Nome do Projeto]

> Design system vivo. Atualizar conforme o produto evolui.

## Identidade Visual

**Personalidade**: [3-5 adjetivos]
**Referencia**: [produto similar no awesome-design-md]
**Publico**: [descricao]

## Cores

| Token | Hex | Uso |
|---|---|---|
| --color-primary | #XXXXXX | Botoes, links, destaques |
| --color-bg | #XXXXXX | Fundo da pagina |
| --color-surface | #XXXXXX | Cards, paineis |
| --color-text | #XXXXXX | Texto principal |
| --color-text-muted | #XXXXXX | Texto secundario |
| --color-border | #XXXXXX | Bordas e divisores |
| --color-success | #XXXXXX | Estados positivos |
| --color-error | #XXXXXX | Erros e alertas |

## Tipografia

| Uso | Fonte | Peso | Tamanho |
|---|---|---|---|
| Display/Hero | [Fonte] | 800 | 48-72px |
| H1 | [Fonte] | 700 | 32-40px |
| H2 | [Fonte] | 600 | 24-28px |
| Body | [Fonte] | 400 | 16px |
| Caption | [Fonte] | 400 | 12-14px |
| Mono | [Fonte] | 400 | 14px |

## Espacamento

Base: 4px | Escala: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 80 / 120px

## Componentes Chave

[Listar os 5-8 componentes mais usados no produto com descricao breve]

## Principios de Design

1. [Principio 1]
2. [Principio 2]
3. [Principio 3]

## Anti-padroes

- Nunca usar: [lista]
- Evitar: [lista]
```

## Paletas rapidas prontas

### Dark Premium (loyalty / fintech)
```
bg: #0A0A0F | surface: #13131A | border: #1E1E2E
text: #F8F8FF | text-muted: #8888AA
primary: #6366F1 | accent: #F59E0B
```

### Light Clean (SaaS B2B)
```
bg: #FAFAFA | surface: #FFFFFF | border: #E4E4E7
text: #09090B | text-muted: #71717A
primary: #2563EB | accent: #0EA5E9
```

### LATAM Brand
```
bg: #0F004F | surface: #1B0088 | border: #2D00CC30
text: #FFFFFF | text-muted: #FFFFFFB0
primary: #FF3E78 | accent: #C8102E
```

## Regras criticas

1. **DESIGN.md primeiro, codigo depois** — Nunca gerar codigo sem decisoes de design validadas
2. **Referencia no Awesome Design MD** — Sempre identificar o produto mais proximo e usar como ancora
3. **Sistema, nao componentes isolados** — Decisoes de cor/fonte/espacamento valem para o projeto todo
4. **Contraste e obrigatorio** — Sem excecoes no 4.5:1 para texto
5. **Mobile first sempre** — 320px e o ponto de partida, nao 1440px

## Combinacao com outras skills

- **tripled-ui**: apos definir o sistema de design, usar TripleD para gerar os componentes
- **latam-deck**: quando o design for para apresentacoes LATAM Pass
- **brand-kit-pro**: quando precisar de identidade de marca completa (logo, aplicacoes)
- **frontend-design**: para implementacao de layout complexo
