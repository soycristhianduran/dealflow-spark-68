import { Loader2, AlertCircle } from "lucide-react";

/**
 * WhatsApp message delivery status icon — exact SVG checkmarks matching
 * WhatsApp's visual style (single grey = sent, double grey = delivered,
 * double blue = read).
 */

const WA_GREY = "#8696a0";
const WA_BLUE = "#53bdeb";

function WaSingleTick({ color }: { color: string }) {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block align-middle">
      <path d="M1.5 5L5 8.5L12.5 1.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WaDoubleTick({ color }: { color: string }) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" fill="none" className="inline-block align-middle">
      <path d="M1.5 5L5 8.5L12.5 1.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 5L9 8.5L16.5 1.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MsgStatus({ status }: { status: string }) {
  if (status === "sending") return <Loader2 className="h-3 w-3 animate-spin" style={{ color: WA_GREY }} />;
  if (status === "failed")  return <AlertCircle className="h-3 w-3 text-red-400" />;
  if (status === "read")      return <WaDoubleTick color={WA_BLUE} />;
  if (status === "delivered") return <WaDoubleTick color={WA_GREY} />;
  return <WaSingleTick color={WA_GREY} />;
}
