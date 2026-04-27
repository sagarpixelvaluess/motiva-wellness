DROP POLICY IF EXISTS "Chat images are publicly viewable" ON storage.objects;

-- Owners can list/select their own files via API
CREATE POLICY "Users list own chat images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);