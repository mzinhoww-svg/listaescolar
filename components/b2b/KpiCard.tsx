// Cartão de número (B2B01), como os KPIs de "chamadas de API no mês" do design. `tone` "dark"/"accent" espelha os
// dois primeiros cartões do B2B01 (fundo Tinta e Verde Certo); "light" é o padrão (fundo branco).

type Tone = "dark" | "accent" | "light";

const TONE_CLASS: Readonly<Record<Tone, string>> = {
  dark: "bg-tinta text-papel",
  accent: "bg-verde-certo text-tinta",
  light: "bg-white text-tinta",
};
const LABEL_TONE: Readonly<Record<Tone, string>> = {
  dark: "text-white/70",
  accent: "text-tinta/80",
  light: "text-texto-3",
};

export function KpiCard({ value, label, tone = "light" }: { value: string; label: string; tone?: Tone }) {
  return (
    <div className={`rounded-[20px] p-5 ${TONE_CLASS[tone]}`}>
      {value === "indisponível" ? (
        <p className="text-[16px] leading-tight font-bold">{value}</p>
      ) : (
        <p className="text-[32px] leading-none font-extrabold tracking-[-0.03em]">{value}</p>
      )}
      <p className={`mt-2 text-[13px] font-semibold ${LABEL_TONE[tone]}`}>{label}</p>
    </div>
  );
}
