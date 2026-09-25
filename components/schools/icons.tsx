import type { ReactNode } from "react";

function Stroke({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const BackIcon = () => (
  <Stroke>
    <path d="M15 18l-6-6 6-6" />
  </Stroke>
);
export const MagnifierIcon = ({ size = 18 }: { size?: number }) => (
  <Stroke size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Stroke>
);
export const CloseIcon = () => (
  <Stroke size={16}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Stroke>
);
export const PersonIcon = () => (
  <Stroke size={20}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Stroke>
);
