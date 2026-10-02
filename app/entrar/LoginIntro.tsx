import { loginIntroFor } from "@/features/auth/login-context";

export function LoginIntro({ next }: { next: string }) {
  const c = loginIntroFor(next);
  return (
    <>
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">{c.title}</h1>
      <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">{c.lead}</p>
    </>
  );
}
