/**
 * ContactWhatsAppThread — embedded WhatsApp conversation for the contact
 * detail page's "WhatsApp" tab. Wraps the shared WhatsAppConversationPanel
 * (same component the standalone inbox uses) with a contact-flavored
 * header showing the contact's name + phone.
 *
 * Feature parity with the standalone inbox: templates, voice recording,
 * file attachments, 24h window banner, message status ticks, media bubbles.
 */
import { MessageCircle, Phone as PhoneIcon } from "lucide-react";
import { WhatsAppConversationPanel } from "@/components/whatsapp/ConversationPanel";

interface Props {
  /** Raw phone (with country code) — same value stored in contacts.primary_phone */
  phone: string;
  /** UUID of the contact, so outgoing messages can be linked back to them */
  contactId: string;
  /** Display name to show in the header */
  contactName?: string | null;
}

export function ContactWhatsAppThread({ phone, contactId, contactName }: Props) {
  return (
    <WhatsAppConversationPanel
      phone={phone}
      contactId={contactId}
      heightClass="h-[600px]"
      header={
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2 shrink-0">
          <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{contactName || phone}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <PhoneIcon className="h-3 w-3" /> {phone}
            </p>
          </div>
        </div>
      }
    />
  );
}
