import Image from "next/image";

const variants = {
  horizontal: { src: "/brand/logo-horizontal.svg", width: 620, height: 140 },
  "horizontal-negativo": { src: "/brand/logo-horizontal-negativo.svg", width: 620, height: 140 },
  simbolo: { src: "/brand/simbolo.svg", width: 120, height: 120 },
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
  const width = Math.round((v.width / v.height) * height);
  return (
    <Image
      src={v.src}
      alt="ListaCerta"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={className}
    />
  );
}
