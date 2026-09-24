import Image from "next/image";
import { Wordmark } from "@/components/brand/Wordmark";

const VB_W = 620;
const VB_H = 140;
/** Percentual da largura total (620) para largura em cqw. */
const cq = (n: number) => `${((n / VB_W) * 100).toFixed(4)}cqw`;

const variants = {
  horizontal: { kind: "composto", symbol: "/brand/simbolo.svg", text: "text-tinta" },
  "horizontal-negativo": {
    kind: "composto",
    symbol: "/brand/simbolo-negativo.svg",
    text: "text-papel",
  },
  simbolo: { kind: "simbolo", src: "/brand/simbolo.svg", width: 120, height: 120 },
} as const;

export type LogoVariant = keyof typeof variants;

type LogoProps = {
  variant?: LogoVariant;
  /** Altura renderizada em px; a largura segue a proporção do arquivo. */
  height?: number;
  priority?: boolean;
  className?: string;
};

export function Logo({
  variant = "horizontal",
  height = 40,
  priority = false,
  className,
}: LogoProps) {
  const v = variants[variant];

  if (v.kind === "simbolo") {
    return (
      <Image
        src={v.src}
        alt="ListaCerta"
        width={Math.round((v.width / v.height) * height)}
        height={height}
        priority={priority}
        unoptimized
        className={className}
      />
    );
  }

  const maxWidth = Math.round((VB_W / VB_H) * height);
  return (
    <span
      className={`relative block w-full ${className ?? ""}`}
      style={{
        maxWidth,
        aspectRatio: `${VB_W} / ${VB_H}`,
        containerType: "inline-size",
      }}
    >
      <Image
        src={v.symbol}
        alt="ListaCerta"
        width={120}
        height={120}
        priority={priority}
        unoptimized
        className="absolute"
        style={{ left: cq(10), top: cq(10), width: cq(120), height: cq(120) }}
      />
      <Wordmark
        aria-hidden
        className={`absolute whitespace-nowrap ${v.text}`}
        style={{ left: cq(160), top: cq(18), fontSize: cq(92), lineHeight: 1 }}
      />
    </span>
  );
}
