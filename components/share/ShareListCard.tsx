import { encodeShortCode, shortLinkUrl } from "@/features/short-links/code";

import { CopyLinkButton } from "./CopyLinkButton";
import { QrSvg } from "./QrSvg";

type Props = { inep: string; gradeSlug: string; origin: string };

/** "Compartilhar esta lista": link curto e QR, sem rede social nem script de terceiros. */
export function ShareListCard({ inep, gradeSlug, origin }: Props) {
  const code = encodeShortCode({ inep, gradeSlug });
  const link = shortLinkUrl(code, origin);
  return (
    <section aria-labelledby="share-title" className="bg-white flex flex-col gap-3 rounded-2xl border border-tinta/10 p-4">
      <h2 id="share-title" className="text-lg font-extrabold tracking-[-0.02em]">
        Compartilhar esta lista
      </h2>
      <p className="text-texto-2 text-sm font-medium">Para o grupo de pais e o mural da escola.</p>
      <p className="bg-papel rounded-lg px-3 py-2 text-sm font-bold break-all select-all">{link}</p>
      <div className="flex items-center gap-4">
        <QrSvg text={link} />
        <div className="flex flex-col gap-2">
          <CopyLinkButton link={link} />
          <a
            href={`/l/${code}/qr?download=1`}
            className="text-verde-fundo focus-visible:outline-verde-fundo inline-flex min-h-11 items-center text-sm font-extrabold underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Baixar QR (SVG)
          </a>
        </div>
      </div>
    </section>
  );
}
