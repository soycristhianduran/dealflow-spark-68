/**
 * KlosifyLogo — Pixel XL brand mark
 * K built from 8 rounded squares in orange→amber gradient
 * CELLS: [[0,0],[2,0],[0,1],[1,1],[0,2],[1,2],[0,3],[2,3]]
 * Each cell: x = 17 + c*22, y = 6 + r*22, w=19, h=19, rx=5
 */

interface KlosifyLogoProps {
  size?: number;
  className?: string;
  /** "color" | "white" | "mono" */
  variant?: "color" | "white" | "mono";
}

const CELLS: [number, number][] = [
  [0, 0], [2, 0],
  [0, 1], [1, 1],
  [0, 2], [1, 2],
  [0, 3], [2, 3],
];

export function KlosifyLogo({ size = 32, className, variant = "color" }: KlosifyLogoProps) {
  const id = `kg-${variant}`;

  const fill =
    variant === "color"
      ? `url(#${id})`
      : variant === "white"
      ? "#ffffff"
      : "#1a1a1a";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label="Klosify"
      role="img"
    >
      {variant === "color" && (
        <defs>
          <linearGradient id={id} x1="20" y1="6" x2="80" y2="91" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFA01E" />
            <stop offset="46%" stopColor="#FF6B2C" />
            <stop offset="100%" stopColor="#E8460E" />
          </linearGradient>
        </defs>
      )}
      {CELLS.map(([c, r], i) => (
        <rect
          key={i}
          x={17 + c * 22}
          y={6 + r * 22}
          width={19}
          height={19}
          rx={5}
          fill={fill}
        />
      ))}
    </svg>
  );
}
