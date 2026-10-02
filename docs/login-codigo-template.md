# Login por código de 6 dígitos (D-163): templates de e-mail

A tela `/entrar` oferece o link mágico e, logo após o envio, um campo para o código de 6 dígitos do mesmo e-mail
(`supabase.auth.verifyOtp({ email, token, type: "email" })`). Em navegador embutido (WhatsApp, Instagram,
Facebook) a tela mostra um aviso com "Abrir no navegador" (Android, intent do Chrome) e "Copiar link".

## Templates versionados
- `supabase/templates/magic_link.html` (assunto: "Seu link de acesso ao ListaCerta")
- `supabase/templates/confirmation.html` (assunto: "Confirme seu e-mail no ListaCerta")

Os dois mantêm o botão com `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` e acrescentam `{{ .Token }}`
(o código). Em local, `supabase/config.toml` já aponta para eles (`[auth.email.template.*]`); `otp_length = 6`.

## Aplicar no Auth hospedado (staging e, depois, produção)
Passo manual do humano; o Supabase hospedado não lê os arquivos do repositório.
1. Dashboard do projeto, Authentication, Emails (Email Templates).
2. Aba "Magic Link": assunto "Seu link de acesso ao ListaCerta"; cole o conteúdo de `magic_link.html`; salve.
3. Aba "Confirm signup": assunto "Confirme seu e-mail no ListaCerta"; cole `confirmation.html`; salve.
4. Authentication, Providers, Email: "Email OTP Length" = 6; "Email OTP Expiration" = 3600 (igual ao `config.toml`).
5. Conferir que o SMTP próprio (Resend/outro) está ativo em produção: o SMTP padrão do Supabase tem limite baixo.
6. Teste: em `/entrar`, peça o e-mail, confirme que ele traz o botão e o código, e que o código entra.

Alternativa por CLI/API: `PATCH https://api.supabase.com/v1/projects/{ref}/config/auth` com
`mailer_templates_magic_link_content`, `mailer_templates_confirmation_content` e os respectivos `mailer_subjects_*`
(exige token pessoal de acesso do humano; não commitar).

## Segurança
- Rate limit local (`features/auth/rate-limit.ts`): 8 verificações por IP + e-mail e 20 por e-mail, por 10 min,
  além do limite do próprio Supabase Auth.
- Código errado, expirado ou e-mail inexistente devolvem a mesma mensagem (não enumera contas).
- O pedido de link/código responde "Verifique seu e-mail" independentemente de o e-mail existir.
