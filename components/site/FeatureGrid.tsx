import { CheckBadge } from "./icons";

type Props = { items: readonly { title: string; text: string }[]; dark?: boolean };

export function FeatureGrid({ items, dark = false }: Props) {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {items.map((i) => (
        <li key={i.title} className={`rounded-card flex flex-col gap-3 p-6 ${dark ? "bg-white/10" : "bg-papel"}`}>
          <CheckBadge />
          <h3 className="text-lg font-extrabold">{i.title}</h3>
          <p className={`text-[15px] leading-relaxed ${dark ? "text-papel/85" : "text-texto-2"}`}>{i.text}</p>
        </li>
      ))}
    </ul>
  );
}
