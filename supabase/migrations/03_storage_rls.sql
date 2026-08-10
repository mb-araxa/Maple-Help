-- Storage RLS for chamados-anexos
-- This assumes the bucket 'chamados-anexos' exists. 
-- Ensure bucket is set to private:
UPDATE storage.buckets SET public = false WHERE id = 'chamados-anexos';

-- Drop existing public policies if any (we are moving to authenticated access)
-- Note: You might need to manually drop them if they have specific names.

-- 1. Insert Policy
-- Users can only upload files to their own folder: chamados-anexos/{user_id}/
CREATE POLICY "Users can upload attachments to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chamados-anexos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Select Policy
-- Requesters can view files in their own folder OR legacy files in root.
CREATE POLICY "Users can view their own attachments and legacy root files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chamados-anexos' AND
  (
    -- Access their own folder
    (storage.foldername(name))[1] = auth.uid()::text
    OR 
    -- Allow access to root files (legacy public files without user_id folder)
    array_length(storage.foldername(name), 1) IS NULL
  )
);

-- Admins and technicians can view all attachments
CREATE POLICY "Admins and technicians can view all attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chamados-anexos' AND
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician')
  )
);

-- 3. Delete Policy
-- Users can delete their own files
CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chamados-anexos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can delete any file
CREATE POLICY "Admins can delete any attachment"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chamados-anexos' AND
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);
