/**
 * D-163: o link de acesso quebra quando o e-mail abre dentro do WhatsApp ou de outro aplicativo. Aparece antes do
 * envio (com a instrução de abrir o e-mail neste aparelho) e de novo depois (onde essa instrução já vem na frase de cima).
 */
export function OpenInBrowserNote({ beforeSend = false, className = "" }: { beforeSend?: boolean; className?: string }) {
  return (
    <p className={`text-texto-2 text-[14px] leading-snug font-semibold ${className}`.trim()}>
      {beforeSend ? "Abra o e-mail neste aparelho. " : ""}
      Se o link abrir dentro do WhatsApp ou de outro aplicativo e o acesso não funcionar, abra o link no navegador do celular (toque nos três pontinhos e escolha abrir no navegador).
    </p>
  );
}
