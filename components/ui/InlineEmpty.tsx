import Link from "next/link";

import { buttonClass } from "./Button";

/** Vazio de subrota com caminho: frase contínua e uma ação secundária embaixo (o link não infla a linha). */
export function InlineEmpty({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-texto-2 text-[15px] font-medium">{text}</p>
      <Link href={href} className={buttonClass("outline", "md", "w-full")}>
        {label}
      </Link>
    </div>
  );
}
