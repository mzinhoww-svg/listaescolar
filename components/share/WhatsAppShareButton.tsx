import { buildListShareMessage, whatsappShareUrl, type ListShareInput } from "@/features/short-links/share-message";

/** Compartilhar no WhatsApp em um toque: abre o app com a mensagem pronta, sem script de terceiros. */
export function WhatsAppShareButton(props: ListShareInput) {
  return (
    <a
      href={whatsappShareUrl(buildListShareMessage(props))}
      target="_blank"
      rel="noopener noreferrer"
      className="border-tinta text-tinta focus-visible:outline-verde-fundo rounded-botao flex h-[52px] w-full items-center justify-center border-[1.5px] text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Compartilhar no WhatsApp
    </a>
  );
}
