CREATE POLICY "school_logos_auth_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'school-logos');
CREATE POLICY "school_logos_staff_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'school-logos' AND public.is_staff(auth.uid()));
CREATE POLICY "school_logos_staff_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'school-logos' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'school-logos' AND public.is_staff(auth.uid()));
CREATE POLICY "school_logos_staff_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'school-logos' AND public.is_staff(auth.uid()));