import { Check, Loader2, AlertCircle } from "lucide-react";

/**
 * WhatsApp message delivery status icon (sending / sent / delivered /
 * read / failed). Renders the familiar 1-tick / 2-tick UX.
 */
export function MsgStatus({ status }: { status: string }) {
  if (status === "sending") return <Loader2 className="h-3 w-3 animate-spin text-gray-400" />;
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-red-400" />;
  if (status === "read") {
    return <span className="text-blue-500 text-[10px] font-bold leading-none">✓✓</span>;
  }
  if (status === "delivered") {
    return <span className="text-gray-400 text-[10px] font-bold leading-none">✓✓</span>;
  }
  return <Check className="h-3 w-3 text-gray-400" />;
}
