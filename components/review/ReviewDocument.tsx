import { formatSize } from "./format";

type Props = { submissionId: string; mimeType: string; sizeBytes: number };

const TYPE_LABEL: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "Imagem JPEG", "image/png": "Imagem PNG", "image/webp": "Imagem WebP", "image/heic": "Imagem HEIC" };

/**
 * Documento enviado. A página só conhece a rota do documento (307 para URL assinada de 60 s); a URL assinada nunca
 * entra no HTML e o nome do arquivo não é exibido.
 */
export function ReviewDocument({ submissionId, mimeType, sizeBytes }: Props) {
  const src = `/admin/revisao/documento/${submissionId}`;
  const showable = mimeType !== "image/heic";
  return (
    <section aria-labelledby="doc-titulo" className="flex flex-col gap-3 rounded-[24px] bg-white p-5">
      <h2 id="doc-titulo" className="text-[17px] font-extrabold">Documento enviado</h2>
      <p className="text-texto-2 text-[13px] font-semibold">{TYPE_LABEL[mimeType] ?? "Arquivo"} · {formatSize(sizeBytes)}</p>
      {showable ? (
        mimeType === "application/pdf" ? (
          <iframe title="Documento enviado (PDF)" src={src} referrerPolicy="no-referrer" className="bg-papel h-[70vh] min-h-[360px] w-full rounded-campo" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- imagem privada servida por redirect assinado; next/image não se aplica
          <img alt="Documento enviado pela família ou pela escola" src={src} referrerPolicy="no-referrer" className="bg-papel max-h-[70vh] w-full rounded-campo object-contain" />
        )
      ) : (
        <p className="bg-campo rounded-campo px-4 py-3 text-[14px] font-semibold">Este formato não tem pré-visualização. Abra o arquivo pelo link abaixo.</p>
      )}
      <a href={src} target="_blank" rel="noopener noreferrer" className="text-verde-fundo inline-flex min-h-11 items-center text-[14px] font-extrabold underline">
        Abrir em outra aba (link de 60 s)
      </a>
    </section>
  );
}
