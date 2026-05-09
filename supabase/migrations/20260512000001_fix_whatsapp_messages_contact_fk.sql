-- Fix: whatsapp_messages.contact_id had NO ACTION on delete, blocking contact deletion.
-- Change to SET NULL so messages are preserved but contact_id is cleared when contact is removed.
ALTER TABLE whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_contact_id_fkey;

ALTER TABLE whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
