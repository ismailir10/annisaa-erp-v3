-- Pack 2: Supabase Storage bucket for admission document uploads
-- (KTP Ayah, KTP Ibu, Kartu Keluarga). Private bucket — no anonymous reads.
-- Bucket is referenced by app code via path convention
-- `tenant/{tenantId}/admission/{admissionId}/{kind}-{uuid}.{ext}`.

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'admission-documents',
  'admission-documents',
  false,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[],
  5242880  -- 5 MB
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

-- RLS: deny direct anon access — uploads + downloads go through signed URLs only.
-- The service role bypasses RLS, so server-side code (lib/supabase/storage.ts) can read/write.
DROP POLICY IF EXISTS "admission_documents_block_anon" ON storage.objects;
CREATE POLICY "admission_documents_block_anon" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'admission-documents')
  WITH CHECK (bucket_id <> 'admission-documents');
