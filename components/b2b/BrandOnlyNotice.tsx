import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";

const TYPE_LABEL: Record<string, string> = { retailer: "varejista", brand: "marca", edtech: "edtech" };

/** UX-123: em vez de "Você não tem acesso", diz qual é o tipo do cadastro e o que ele libera. A barreira real segue no servidor. */
export function BrandOnlyNotice({ partnerType }: { partnerType: string }) {
  const label = TYPE_LABEL[partnerType] ?? partnerType;
  return (
    <section className="flex max-w-2xl flex-col gap-3 rounded-[20px] bg-white p-6">
      <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">Campanhas são para parceiros do tipo marca</h2>
      <p className="text-texto-2 text-[15px] font-medium">
        Seu cadastro é do tipo {label}. Com ele você usa a API, o widget e os webhooks. Para anunciar um produto como sugestão patrocinada, o cadastro precisa ser de marca. Se o tipo estiver errado,
        fale com o time.
      </p>
      <Link href="/b2b/api" className={buttonClass("outline", "md", "w-fit")}>
        Ir para API e chaves
      </Link>
    </section>
  );
}
