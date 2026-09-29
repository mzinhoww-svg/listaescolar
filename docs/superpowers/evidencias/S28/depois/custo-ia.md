# S28 · Custo de IA por lista (M02)

Gerado por `scripts/s28-custo-ia.ts` em 2026-09-29, banco local da trilha 2, sem chamar provedor real.

## 1. Prova do cálculo (dados SINTÉTICOS)

20 listas passaram pelo roteador de produção, pelo gravador e pelo RPC `ai_record_decision` reais, com o provedor falso e custos sintéticos (rótulos de teste: **não são preço de nenhum modelo**) e taxa sintética de 5.00 BRL por USD (**não é câmbio de mercado**). A view `ai_cost_per_entity` foi conferida lista a lista contra a conta independente; tudo sofreu rollback.

- Resultado da conferência: **sem divergência**.
- Listas: 20; com custo completo: 18; parciais (uma leitura sem custo, fora das médias): 2.
- Sintético: média US$ 0.0925, p95 US$ 0.1800, máximo US$ 0.1800; em reais (taxa sintética) média R$ 0,46.

## 2. Custo real por lista

**Indisponível.** O banco apontado não tem nenhuma lista lida por provedor real com custo informado pelo provedor (nenhuma decisão de provedor real registrada).

O motivo é a regra do repositório: só o humano roda a IA real (custa dinheiro; `scripts/ai-smoke.ts`), e a chave do OpenRouter não é usada por agentes. Nada foi estimado nem multiplicado por preço de modelo.

**Meta < R$ 0,50 por lista: NÃO verificada.** A verificação fica para o E2E no staging (S20): cadastrar a taxa em `/admin/ia`, enviar listas reais e ler o bloco "Custo por lista".

## Origem dos números

- Tokens e custo em dólar: devolvidos pelo OpenRouter em `usage` (`usage: { include: true }`), gravados por decisão em `ai_decisions` (migration `0800`).
- Taxa BRL por USD: `ai_settings.usd_brl_rate`, cadastrada pelo operador em `/admin/ia`; sem ela, reais ficam indisponíveis.
- Lista com qualquer leitura sem custo é parcial e nunca entra como total.
