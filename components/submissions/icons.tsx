type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const });
const stroke = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const CameraIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" {...stroke} />
    <circle cx="12" cy="13" r="3.2" {...stroke} />
  </svg>
);
export const ChevronLeftIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M14.5 6 8.5 12l6 6" {...stroke} />
  </svg>
);
export const BoltIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" {...stroke} />
  </svg>
);
export const ClockIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" {...stroke} />
    <path d="M12 7.5V12l3 2" {...stroke} />
  </svg>
);
export const UploadIcon = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 16V5m0 0-4 4m4-4 4 4M5 15v4h14v-4" {...stroke} />
  </svg>
);
export const FileIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 3h8l4 4v14H6z" {...stroke} />
    <path d="M14 3v4h4" {...stroke} />
  </svg>
);
export const CheckIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" {...stroke} strokeWidth={2.6} />
  </svg>
);
