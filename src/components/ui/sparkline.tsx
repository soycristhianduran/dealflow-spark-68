/**
 * Sparkline — a tiny inline-SVG line chart for KPI cards.
 *
 * No dependencies, no recharts overhead (~100KB saved). Pass an array of
 * numbers and it renders a smooth-ish polyline + an end-point dot.
 *
 * Tip: feed at most 14-20 data points. More than that and the line gets
 * noisy inside the small footprint.
 */
import { cn } from "@/lib/utils";

interface Props {
  /** Data points oldest → newest. Renders left-to-right. */
  data: number[];
  /** Width in pixels (intrinsic SVG size). Default 80. */
  width?: number;
  /** Height in pixels. Default 28. */
  height?: number;
  /** Stroke color. Defaults to current text color. */
  color?: string;
  /** Show end-point dot? Default true. */
  showDot?: boolean;
  /** Extra classes for the wrapping <svg>. */
  className?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = "currentColor",
  showDot = true,
  className,
}: Props) {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} className={cn("inline-block", className)}>
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="2,2"
          opacity={0.25}
        />
      </svg>
    );
  }

  // Pad single-value series with a duplicate so we still get a flat line
  const series = data.length === 1 ? [data[0], data[0]] : data;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;

  // Inset so stroke doesn't get clipped at edges
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * innerW;
    // Invert Y because SVG origin is top-left
    const y = pad + innerH - ((v - min) / range) * innerH;
    return { x, y };
  });

  // Build a smooth-ish path with quadratic curves between points
  const path = points.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    const prev = points[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `${d} Q ${cx.toFixed(2)} ${prev.y.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }, "");

  // Area fill under the line — gives that "stock chart" filled look
  const areaPath = `${path} L ${points[points.length - 1].x.toFixed(2)} ${height - pad} L ${points[0].x.toFixed(2)} ${height - pad} Z`;

  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      className={cn("inline-block overflow-visible", className)}
      style={{ color }}
    >
      {/* Subtle area fill */}
      <path d={areaPath} fill={color} opacity={0.12} />
      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End-point dot */}
      {showDot && (
        <circle cx={last.x} cy={last.y} r={2.5} fill={color} stroke="white" strokeWidth={1} />
      )}
    </svg>
  );
}

/**
 * Compute a count-per-day series from an array of timestamps.
 *
 *   @param dates - ISO timestamps (e.g. created_at)
 *   @param days - number of trailing days to include (default 7)
 *   @returns array of counts oldest→newest, length === days
 *
 * Useful for "new contacts last 7 days" sparklines.
 */
export function dailyCounts(dates: string[], days: number = 7): number[] {
  const buckets: number[] = new Array(days).fill(0);
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  for (const isoStr of dates) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) continue;
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (daysAgo < 0 || daysAgo >= days) continue;
    // index 0 = oldest, index days-1 = today
    const idx = days - 1 - daysAgo;
    buckets[idx]++;
  }

  return buckets;
}

/**
 * Compute a simple % change between the last data point and the previous.
 * Returns null if the previous is 0 (no baseline).
 */
export function trendPct(series: number[]): number | null {
  if (series.length < 2) return null;
  const prev = series.slice(0, -1).reduce((a, b) => a + b, 0);
  const curr = series[series.length - 1];
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round((curr / (prev / (series.length - 1)) - 1) * 100);
}
