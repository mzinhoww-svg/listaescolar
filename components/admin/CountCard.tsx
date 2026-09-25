type Props = { label: string; value: number | string; hint?: string };

export function CountCard({ label, value, hint }: Props) {
  return (
    <div className="rounded-card bg-branco-tonal flex flex-col gap-1 px-6 py-5">
      <span className="text-texto-3 text-xs font-extrabold tracking-[0.08em] uppercase">{label}</span>
      <span className="text-[32px] leading-none font-extrabold tracking-[-0.03em]">{value}</span>
      {hint ? <span className="text-texto-3 text-[13px]">{hint}</span> : null}
    </div>
  );
}
