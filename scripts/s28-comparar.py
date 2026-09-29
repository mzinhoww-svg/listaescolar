#!/usr/bin/env python3
"""S28 Task 30: monta docs/superpowers/evidencias/S28/comparacao.md (antes x depois) e as capturas lado a lado.
Lê antes/{lighthouse,axe}.md e depois/{lighthouse,axe}.md gerados por scripts/s28-medir.mjs."""
import os, re
from PIL import Image, ImageDraw

ROOT = "docs/superpowers/evidencias/S28"
ACEITE = ["inicio", "busca", "lista", "carrinho", "login", "papelaria", "como-funciona"]  # "landing" = início + como funciona


def rows(path):
    out = {}
    for line in open(path, encoding="utf8"):
        if line.startswith("|") and not line.startswith("|---") and "Página" not in line and "Chave" not in line:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            out[cells[0]] = cells
    return out


lh_a, lh_d = rows(f"{ROOT}/antes/lighthouse.md"), rows(f"{ROOT}/depois/lighthouse.md")
ax_a, ax_d = rows(f"{ROOT}/antes/axe.md"), rows(f"{ROOT}/depois/axe.md")
ck = rows(f"{ROOT}/depois/checks.md")


def lh(r):  # perf, a11y, lcp, cls, tbt
    return (r[2], r[3], r[6], r[7], r[8]) if r else ("-",) * 5


def sc(r):  # críticas + sérias, moderadas
    return (int(r[1]) + int(r[2]), int(r[3]) + int(r[4])) if r else None


keys = list(lh_d)
lines = [
    "# Antes x depois · S28",
    "",
    "Build de produção local (`next start`), Supabase local com dados de demonstração, Lighthouse 12 mobile (4G simulado, CPU 4x), mediana de 3 execuções, axe-core 4.13 a 390x844. Antes: base `1b9fb28` (sem S19). Depois: com a S19 integrada (CSP com nonce, Sentry). Gerado por `scripts/s28-comparar.py` a partir de `antes/*.md` e `depois/*.md`.",
    "",
    "| Página | Rota | Desempenho (antes → depois) | Acessibilidade | LCP | CLS | TBT | axe sérias+críticas | axe moderadas |",
    "|---|---|---|---|---|---|---|---|---|",
]
for k in keys:
    d, a = lh(lh_d[k]), lh(lh_a.get(k))
    sa, sd = sc(ax_a.get(k)), sc(ax_d.get(k))
    fmt = lambda x, y: f"{x} → {y}"
    lines.append(
        f"| {k} | {lh_d[k][1]} | {fmt(a[0], d[0])} | {fmt(a[1], d[1])} | {fmt(a[2], d[2])} | {fmt(a[3], d[3])} | {fmt(a[4], d[4])} | "
        f"{(str(sa[0]) if sa else 'n/m')} → {sd[0] if sd else 'n/m'} | {(str(sa[1]) if sa else 'n/m')} → {sd[1] if sd else 'n/m'} |"
    )
lines += ["", "n/m = página não medida na linha de base (Task 20 acrescentou as áreas logadas).", ""]

ok_perf = all(int(lh_d[k][2]) >= 90 for k in ACEITE if k in lh_d and lh_d[k][2].isdigit())
ok_a11y = all(int(lh_d[k][3]) >= 90 for k in ACEITE if k in lh_d and lh_d[k][3].isdigit())
ok_axe = all((sc(ax_d[k]) or (0, 0))[0] == 0 for k in ACEITE if k in ax_d)
bad = re.search(r"Rotas com falha: \*\*(\d+)\*\*", open(f"{ROOT}/depois/checks.md", encoding="utf8").read())
lines += [
    "## Aceite",
    "",
    f"- Lighthouse desempenho ≥ 90 nas 7 páginas do aceite (início, busca, lista, carrinho, login, papelaria, como funciona): **{'sim' if ok_perf else 'NÃO'}**.",
    f"- Lighthouse acessibilidade ≥ 90 nas mesmas: **{'sim' if ok_a11y else 'NÃO'}**.",
    f"- axe sem violação séria ou crítica nas mesmas: **{'sim' if ok_axe else 'NÃO'}**.",
    f"- Checagens próprias (rolagem, main, h1, alvo de toque, texto < 12 px) em `depois/checks.md`: **{bad.group(1) if bad else '?'} rota(s) com falha**.",
    "",
    "## Capturas lado a lado (390x844)",
    "",
    "Esquerda: antes. Direita: depois. Arquivos `depois/lado-a-lado-<página>.png`.",
    "",
]

shots = [k for k in keys if os.path.exists(f"{ROOT}/antes/{k}.png") and os.path.exists(f"{ROOT}/depois/{k}.png")]
for k in shots:
    a, d = Image.open(f"{ROOT}/antes/{k}.png").convert("RGB"), Image.open(f"{ROOT}/depois/{k}.png").convert("RGB")
    h, gap, top = max(a.height, d.height), 24, 36
    im = Image.new("RGB", (a.width + d.width + gap, h + top), (245, 242, 234))
    dr = ImageDraw.Draw(im)
    dr.text((8, 10), f"ANTES · {k}", fill=(15, 27, 45))
    dr.text((a.width + gap + 8, 10), f"DEPOIS · {k}", fill=(11, 107, 74))
    im.paste(a, (0, top)); im.paste(d, (a.width + gap, top))
    im.save(f"{ROOT}/depois/lado-a-lado-{k}.png", optimize=True)
    lines.append(f"- `{k}`: ![{k}](depois/lado-a-lado-{k}.png)")
open(f"{ROOT}/comparacao.md", "w", encoding="utf8").write("\n".join(lines) + "\n")
print("ok", len(shots), "capturas")
