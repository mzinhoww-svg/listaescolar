# Pesquisa com mães · Kit de divulgação

URL de produção: `https://listaescolare.vercel.app/pesquisa`

Cada grupo recebe um link com `?g=<origem>` (até 60 caracteres, minúsculas, sem espaço). A origem fica gravada em `source_group` e aparece na seção "Por origem" de `/pesquisa/resultados`, então dá para saber de qual grupo veio cada resposta. Quem responder e clicar em "Enviar para outra mãe" gera links com `ref=<sessão>&g=indicacao` — indicações aparecem como origem `indicacao`.

## Links por grupo (exemplos)

| Grupo | Link |
|---|---|
| Notre Dame | https://listaescolare.vercel.app/pesquisa?g=notredame |
| Grupo de mães 1 | https://listaescolare.vercel.app/pesquisa?g=grupo-maes-1 |
| Grupo de mães 2 | https://listaescolare.vercel.app/pesquisa?g=grupo-maes-2 |

Para um grupo novo, basta trocar o valor depois de `g=` (ex.: `?g=escola-x`, `?g=condominio-y`).

## Mensagem para colar no grupo

WhatsApp formata `*negrito*` e `_itálico_`. Troque o link pelo do grupo.

```
Oi, mães! 👋

Estou ajudando a criar a *ListaCerta*, um jeito mais fácil de resolver a lista de material escolar.

Pode me dar 3 minutos? É uma pesquisa rápida sobre como foi comprar a lista este ano: *12 perguntas, anônima, sem nenhum dado do seu filho*.

👉 https://listaescolare.vercel.app/pesquisa?g=grupo-maes-1

No final, se quiser, dá para deixar o WhatsApp para receber a lista da sua escola pronta em janeiro.

Qualquer dúvida, me chama: https://wa.me/5565996227110
```

Versão curta (para repostar ou lembrar):

```
Mães, quem ainda não respondeu: 3 minutinhos, anônima, sem dado do seu filho 🙏
https://listaescolare.vercel.app/pesquisa?g=grupo-maes-1
```

## Link de contato (seu WhatsApp)

`https://wa.me/5565996227110` abre uma conversa com você. Com mensagem pré-preenchida (a pessoa só aperta enviar):

`https://wa.me/5565996227110?text=Oi%2C%20vi%20a%20pesquisa%20da%20ListaCerta%20e%20queria%20tirar%20uma%20d%C3%BAvida`

O número só aparece nesta mensagem, que você controla; ele **não** está publicado em nenhuma página do site (Ruling no ledger).

## Depois de enviar

- Resultados: `https://listaescolare.vercel.app/pesquisa/resultados` (senha no relatório final da sessão; não está no repositório).
- Backup: botões "Baixar respostas (CSV)" e "Baixar leads (CSV)" na página de resultados — recomendado semanal (ADR-005).
- Metas da spec: 100 completas até 31/10/2026, conclusão ≥ 60%, mediana < 3 min, ≥ 40% das completas com contato.
