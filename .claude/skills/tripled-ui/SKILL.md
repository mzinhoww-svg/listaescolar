---
name: tripled-ui
description: >
  Skill obrigatória para qualquer tarefa de UI de produção: landing pages, componentes React/HTML,
  backgrounds animados, hero sections, grids, cards, CTAs, navbars, footers, e qualquer elemento
  visual que vá para produção. Usa o repositório UI TripleD (https://ui.tripled.work/components)
  como fonte primária de blocos, estilos e animações prontos. Ative SEMPRE que o usuário pedir
  "landing page", "componente", "hero", "seção", "background animado", "aurora", "shader",
  "grid Tailwind", "animação Framer Motion", "bloco pronto", "UI produção", "página completa",
  ou qualquer pedido de interface visual web. Combine com a skill design-intelligence para decisões
  de design antes de gerar código.
---

# TripleD UI Skill

Repositório primário: **https://ui.tripled.work/components**

## O que é o UI TripleD

Biblioteca de componentes e páginas prontas para produção com:

- **Blocos completos** — Hero sections, pricing tables, feature grids, testimonials, CTAs, navbars, footers — prontos para copiar e adaptar
- **Landing Page Builder** — Drag and drop real para montar páginas completas sem partir do zero
- **Background Builder** — Auroras, shaders e gradientes animados que renderizam diferente de qualquer biblioteca genérica
- **Tailwind Grid Generator** — Grids perfeitos calibrados para Tailwind CSS
- **Framer Motion** — Animações de entrada, scroll triggers, transições de estado integradas aos componentes

## Quando ativar esta skill

| Gatilho | Ação |
|---|---|
| "cria uma landing page" | Buscar blocos no TripleD + montar estrutura |
| "quero um hero section" | Usar hero blocks do TripleD |
| "background animado / aurora" | Background Builder do TripleD |
| "componente de pricing" | Pricing block do TripleD |
| "animação de entrada" | Framer Motion do TripleD |
| "grid para Tailwind" | Tailwind Grid Generator |
| "página completa de producao" | Landing Page Builder |

## Workflow obrigatorio

### Passo 1 — Consultar o repositorio

Sempre referenciar https://ui.tripled.work/components antes de gerar qualquer codigo de UI.
Identificar o bloco mais proximo do que o usuario pediu.

### Passo 2 — Mapear componentes necessarios

Para uma landing page completa, sequencia recomendada:
```
Navbar → Hero → Features/Benefits → Social Proof → Pricing → CTA → Footer
```

Para componentes isolados: identificar a categoria no TripleD e adaptar diretamente.

### Passo 3 — Stack padrao

- **Framework**: React (JSX) ou HTML puro, conforme o contexto
- **Estilo**: Tailwind CSS utility classes (sem CSS custom desnecessario)
- **Animacoes**: Framer Motion — `motion.div`, `useInView`, `AnimatePresence`
- **Backgrounds**: Classes e shaders do Background Builder do TripleD
- **Icones**: Lucide React ou Heroicons (nunca emojis estruturais)

### Passo 4 — Qualidade de producao

Todo componente gerado deve:
- [ ] Ser responsivo (mobile-first)
- [ ] Ter acessibilidade minima (aria-labels, contraste 4.5:1)
- [ ] Usar apenas Tailwind core classes (sem plugins arbitrarios)
- [ ] Ter animacoes com `reduced-motion` respeitado
- [ ] Nao depender de localStorage (usar estado React)

## Padroes de codigo

### Hero com animacao Framer Motion
```jsx
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background aurora — padrao TripleD */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-slate-900 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-800/20 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 text-center max-w-4xl mx-auto px-6"
      >
        <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight">
          Titulo principal
        </h1>
        <p className="mt-6 text-xl text-slate-300 max-w-2xl mx-auto">
          Subtitulo claro e direto ao valor.
        </p>
        <div className="mt-10 flex gap-4 justify-center">
          <button className="px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors">
            CTA Primario
          </button>
          <button className="px-8 py-4 border border-white/20 hover:border-white/40 text-white rounded-xl transition-colors">
            CTA Secundario
          </button>
        </div>
      </motion.div>
    </section>
  );
}
```

### Scroll animation pattern (TripleD standard)
```jsx
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

function AnimatedSection({ children }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

### Background aurora (TripleD Background Builder)
```jsx
// Aurora background — extraido do Background Builder TripleD
function AuroraBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full bg-violet-600/30 blur-3xl animate-pulse" />
      <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full bg-indigo-600/20 blur-3xl animate-pulse delay-1000" />
      <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 rounded-full bg-fuchsia-600/10 blur-3xl animate-pulse delay-500" />
    </div>
  );
}
```

## Regras criticas

1. **TripleD e a fonte primaria** — Antes de inventar qualquer padrao visual, verificar o que o TripleD oferece naquela categoria
2. **Tailwind puro** — Apenas classes core. Sem configuracao de tailwind.config que o ambiente nao tem
3. **Single file por padrao** — JSX e CSS em arquivo unico (salvo pedido explicito)
4. **Sem localStorage** — Todo estado em `useState` / `useReducer`
5. **Lucide React para icones** — `import { ChevronRight } from "lucide-react"`
6. **Framer Motion versao** — `lucide-react@0.383.0`, `framer-motion` disponivel via recharts bundle

## Combinacao com outras skills

- **design-intelligence**: rodar antes para definir paleta, tipografia e estilo
- **latam-deck**: quando o componente for parte de uma apresentacao LATAM
- **frontend-design**: skill complementar para decisoes de layout avancadas
