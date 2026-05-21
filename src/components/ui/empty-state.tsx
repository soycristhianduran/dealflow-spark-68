/**
 * EmptyState — branded illustration + message + optional CTA.
 *
 * Replaces the "Sin contactos" / "Sin deals" plain-text empty spots that
 * used to make the app feel half-finished. Each variant has its own
 * inline SVG illustration so we don't ship an image asset bundle.
 *
 * Usage:
 *   <EmptyState
 *     variant="contacts"
 *     title="Aún no tienes leads"
 *     description="Importa tus contactos o crea el primero manualmente"
 *     action={<Button onClick={...}>Crear lead</Button>}
 *   />
 */

import { cn } from "@/lib/utils";

type Variant =
  | "contacts"
  | "deals"
  | "conversations"
  | "meetings"
  | "tasks"
  | "search"
  | "companies"
  | "generic";

interface Props {
  variant?: Variant;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  variant = "generic",
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        "animate-in fade-in duration-500",
        className,
      )}
    >
      <div className="mb-4 h-32 w-32">
        <Illustration variant={variant} />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Illustrations
 * ─────────────────────────────────────────────────────────────────────────
 * Hand-rolled SVG with:
 *   - Primary stroke in orange (var(--primary)) for brand consistency
 *   - Light orange fill (var(--primary-soft)) for warmth
 *   - Muted gray accents for secondary details
 * Designed at 128x128 so they fit perfectly in the EmptyState wrapper. */

function Illustration({ variant }: { variant: Variant }) {
  const stroke = "hsl(var(--primary))";
  const fill = "hsl(var(--primary-soft))";
  const muted = "hsl(var(--muted-foreground) / 0.3)";

  switch (variant) {
    case "contacts":
      return (
        <svg viewBox="0 0 128 128" fill="none" className="h-full w-full">
          {/* Card background */}
          <rect x="20" y="32" width="88" height="72" rx="10" fill={fill} stroke={stroke} strokeWidth="2" />
          {/* Avatar circle */}
          <circle cx="44" cy="62" r="14" fill="white" stroke={stroke} strokeWidth="2" />
          <circle cx="44" cy="58" r="5" fill={stroke} />
          <path d="M 32 75 Q 44 68 56 75" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* Text lines */}
          <rect x="64" y="54" width="32" height="3" rx="1.5" fill={muted} />
          <rect x="64" y="62" width="24" height="3" rx="1.5" fill={muted} />
          {/* Phone line */}
          <rect x="32" y="86" width="64" height="3" rx="1.5" fill={muted} />
          {/* Plus badge */}
          <circle cx="100" cy="38" r="11" fill={stroke} />
          <path d="M 100 33 V 43 M 95 38 H 105" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "deals":
      return (
        <svg viewBox="0 0 128 128" fill="none" className="h-full w-full">
          {/* Pipeline columns */}
          <rect x="14" y="36" width="32" height="64" rx="6" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="50" y="28" width="32" height="72" rx="6" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="86" y="44" width="32" height="56" rx="6" fill={fill} stroke={stroke} strokeWidth="2" />
          {/* Deal cards inside */}
          <rect x="20" y="44" width="20" height="14" rx="3" fill="white" stroke={stroke} strokeWidth="1.5" />
          <rect x="20" y="62" width="20" height="14" rx="3" fill="white" stroke={stroke} strokeWidth="1.5" />
          <rect x="56" y="36" width="20" height="14" rx="3" fill="white" stroke={stroke} strokeWidth="1.5" />
          <rect x="92" y="52" width="20" height="14" rx="3" fill="white" stroke={stroke} strokeWidth="1.5" />
          {/* Dollar sign */}
          <circle cx="64" cy="80" r="11" fill={stroke} />
          <path d="M 64 73 V 87 M 60 76 Q 60 80 64 80 Q 68 80 68 83 Q 68 86 64 86 Q 60 86 60 84" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      );

    case "conversations":
      return (
        <svg viewBox="0 0 128 128" fill="none" className="h-full w-full">
          {/* Back bubble */}
          <path d="M 24 38 Q 24 28 34 28 H 78 Q 88 28 88 38 V 62 Q 88 72 78 72 H 50 L 38 84 V 72 H 34 Q 24 72 24 62 Z"
                fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="34" y="40" width="36" height="3" rx="1.5" fill={stroke} />
          <rect x="34" y="48" width="28" height="3" rx="1.5" fill={muted} />
          <rect x="34" y="56" width="32" height="3" rx="1.5" fill={muted} />
          {/* Front reply bubble */}
          <path d="M 50 56 Q 50 46 60 46 H 100 Q 110 46 110 56 V 78 Q 110 88 100 88 H 80 L 70 100 V 88 H 60 Q 50 88 50 78 Z"
                fill="white" stroke={stroke} strokeWidth="2" />
          <rect x="60" y="58" width="36" height="3" rx="1.5" fill={muted} />
          <rect x="60" y="66" width="28" height="3" rx="1.5" fill={muted} />
          <rect x="60" y="74" width="22" height="3" rx="1.5" fill={muted} />
        </svg>
      );

    case "meetings":
      return (
        <svg viewBox="0 0 128 128" fill="none" className="h-full w-full">
          {/* Calendar */}
          <rect x="20" y="32" width="88" height="76" rx="8" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="20" y="32" width="88" height="16" rx="8" fill={stroke} />
          <rect x="20" y="40" width="88" height="8" fill={stroke} />
          <line x1="36" y1="24" x2="36" y2="40" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <line x1="92" y1="24" x2="92" y2="40" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          {/* Day cells */}
          <g fill={muted}>
            <rect x="32" y="58" width="8" height="6" rx="1" />
            <rect x="48" y="58" width="8" height="6" rx="1" />
            <rect x="64" y="58" width="8" height="6" rx="1" />
            <rect x="80" y="58" width="8" height="6" rx="1" />
            <rect x="32" y="74" width="8" height="6" rx="1" />
            <rect x="80" y="74" width="8" height="6" rx="1" />
            <rect x="32" y="90" width="8" height="6" rx="1" />
            <rect x="48" y="90" width="8" height="6" rx="1" />
          </g>
          {/* Highlighted day */}
          <rect x="48" y="74" width="8" height="6" rx="1" fill={stroke} />
          <rect x="64" y="74" width="8" height="6" rx="1" fill={stroke} opacity="0.5" />
        </svg>
      );

    case "tasks":
      return (
        <svg viewBox="0 0 128 128" fill="none" className="h-full w-full">
          {/* Clipboard */}
          <rect x="28" y="24" width="72" height="92" rx="6" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="48" y="18" width="32" height="14" rx="3" fill={stroke} />
          {/* Checkbox rows */}
          <g>
            <rect x="40" y="46" width="10" height="10" rx="2" fill={stroke} />
            <path d="M 42 51 L 45 54 L 49 49" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="54" y="48" width="34" height="3" rx="1.5" fill={muted} />
          </g>
          <g>
            <rect x="40" y="64" width="10" height="10" rx="2" fill={stroke} />
            <path d="M 42 69 L 45 72 L 49 67" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="54" y="66" width="26" height="3" rx="1.5" fill={muted} />
          </g>
          <g>
            <rect x="40" y="82" width="10" height="10" rx="2" stroke={stroke} strokeWidth="2" fill="white" />
            <rect x="54" y="84" width="30" height="3" rx="1.5" fill={muted} />
          </g>
          <g>
            <rect x="40" y="100" width="10" height="10" rx="2" stroke={stroke} strokeWidth="2" fill="white" />
            <rect x="54" y="102" width="22" height="3" rx="1.5" fill={muted} />
          </g>
        </svg>
      );

    case "search":
      return (
        <svg viewBox="0 0 128 128" fill="none" className="h-full w-full">
          <circle cx="54" cy="54" r="28" fill={fill} stroke={stroke} strokeWidth="3" />
          <line x1="74" y1="74" x2="98" y2="98" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
          <circle cx="54" cy="54" r="12" fill="white" stroke={muted} strokeWidth="1.5" />
          {/* Question mark inside */}
          <path d="M 50 50 Q 50 46 54 46 Q 58 46 58 50 Q 58 53 54 54 V 56" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="54" cy="60" r="1.5" fill={stroke} />
        </svg>
      );

    case "companies":
      return (
        <svg viewBox="0 0 128 128" fill="none" className="h-full w-full">
          {/* Building */}
          <rect x="32" y="36" width="64" height="72" rx="6" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="32" y="36" width="64" height="14" rx="6" fill={stroke} />
          <rect x="32" y="44" width="64" height="6" fill={stroke} />
          {/* Windows */}
          <g fill="white" stroke={stroke} strokeWidth="1.5">
            <rect x="42" y="58" width="10" height="10" rx="1" />
            <rect x="58" y="58" width="10" height="10" rx="1" />
            <rect x="74" y="58" width="10" height="10" rx="1" />
            <rect x="42" y="74" width="10" height="10" rx="1" />
            <rect x="58" y="74" width="10" height="10" rx="1" />
            <rect x="74" y="74" width="10" height="10" rx="1" />
          </g>
          {/* Door */}
          <rect x="58" y="90" width="12" height="18" rx="1" fill={stroke} />
          <circle cx="66" cy="100" r="1" fill="white" />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 128 128" fill="none" className="h-full w-full">
          <circle cx="64" cy="64" r="40" fill={fill} stroke={stroke} strokeWidth="2" />
          <circle cx="64" cy="64" r="20" fill="white" stroke={stroke} strokeWidth="2" />
          <path d="M 56 64 L 62 70 L 74 56" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
  }
}
