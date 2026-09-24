# Mapa de telas por fatia

As telas em `docs/design/png` são a referência visual obrigatória. Os arquivos em `docs/design/html` trazem textos, hierarquia e medidas exatas: leia antes de montar cada tela. Reproduza layout, textos, estados e tokens. Não invente telas novas sem registrar um Ruling.

- **Mobile:** 390 × 844 (família, papelaria mobile).
- **Desktop:** 1280 × 800 (escola, admin, papelaria, B2B).
- **Site:** Landing a 1440 de largura, ComoFunciona a 1600.

| Fatia | Telas de referência | Rotas sugeridas |
|---|---|---|
| S00 | Sistema e Main (em `docs/brand/pranchas`) | layout base |
| S02 | App01-Boas-vindas, App02-Cadastro, App11-AuthCallback, Sis05-403, Sis06-404 | /entrar, /auth/callback, /403 |
| S03 | Admin02-Escolas, Admin03-EscolaDetalhe | /admin/importacoes, /admin/escolas |
| S04 | App03-Inicio, App04-Busca, App10-Escola, App14-EscolaPublica, App14b-EscolaEstados | /, /escolas, /escolas/[inep] |
| S05 | App05-Lista, Escola07-NovaLista, Escola10-ListaDetalhe | /escolas/[inep]/[serie], /escola/listas |
| S06 | Escola01-Cadastrar, Escola02-Aguardando, Escola03-MinhasEscolas, Escola04-Status, Escola05-Admins, Escola06-Convite, Escola12-Rede, Admin04-Claims | /escola/*, /admin/reivindicacoes |
| S07 | App06-Foto, App15-EnviarLista, App20-AILoading, Escola08-UploadPDF | /enviar-lista, /escola/listas/nova |
| S08 e S09 | Admin06-Sessoes, Admin07-SessaoDetalhe | /admin/sessoes |
| S10 | Escola09-Revisar, Admin05-ListasPendentes | /admin/revisao, /escola/listas/[id]/revisar |
| S11 | App24-AviseMe, App16-HubPais (central) | /conta/notificacoes |
| S12 | App07-Carrinho, App17-CarrinhoOpcoes, App18-Checkout, Sis02-IrPara | /carrinho/[id], /ir-para/[cartId]/[retailer] |
| S13 | Pap01-Cadastro, Pap04-Catalogo, Pap08-PerfilPublico, Admin09-Papelarias, Escola11-Papelarias | /papelaria/*, /admin/papelarias |
| S14 | App08-Cotacao, App09-Confirmacao, App21-EscolherPapelaria, Pap02-Leads, Pap02m-Leads, Pap03-LeadDetalhe, Pap03m-LeadDetalhe, Pap05-EnviarListas | /cotacao/*, /papelaria/leads |
| S15 | App12-MinhaConta, App13-NovoAluno, App16-HubPais, App19-Historico | /conta/* |
| S16 | Admin01-Visao, Admin08-Eventos | /admin |
| S21 | Pap06-Creditos, Admin10-Planos | /papelaria/creditos, /admin/planos |
| S22 | App22-VoceComprou, App23-Avaliar, Admin11-Auditoria, Admin12-Contestacoes, Pap07-Desempenho | /conta/compras, /admin/contestacoes |
| S23 | Admin13-Repasses, Admin14-Inadimplencia | /admin/repasses, /admin/inadimplencia |
| S24 | B2B00-Parceiros, B2B01-Visao, B2B02-API, B2B03-Docs, Admin15-ParceirosB2B | /parceiros, /b2b/*, /v1/* |
| S25 | B2B04-Widget, B2B05-Webhooks | /b2b/widget, /b2b/webhooks |
| S26 | B2B06-Campanhas, B2B07-NovaCampanha, B2B08-Insights, B2B09-Faturamento, Admin16-Campanhas | /b2b/campanhas, /admin/campanhas |
| S27 | Landing, ComoFunciona, Sis01-LinkCurto, Sis03-Privacidade, Sis04-Termos, Sis07-Sobre | /, /como-funciona, /l/[code], /privacidade, /termos, /sobre |

Números das telas (contagens, preços, nomes) são de demonstração. No app real, tudo vem do banco ou aparece como vazio ou indisponível.
