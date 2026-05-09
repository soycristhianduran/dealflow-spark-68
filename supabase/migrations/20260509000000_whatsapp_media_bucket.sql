-- Create public bucket for WhatsApp media files (images, videos sent with templates)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  52428800, -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/3gpp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload their own files
CREATE POLICY "Users can upload whatsapp media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Authenticated users can delete their own files
CREATE POLICY "Users can delete whatsapp media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'whatsapp-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can read (Meta needs public access to download the image)
CREATE POLICY "Public can read whatsapp media"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'whatsapp-media');
