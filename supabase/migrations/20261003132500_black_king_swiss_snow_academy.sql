-- Owner mapping, 2026-10-03: Booking's "Schwarzer Koenig/Koenigin" is Swiss Snow Academy.
-- Preserve the legacy ID and its existing course/group/source relations. The canonical
-- ski_academy courses already exist; label the second (inactive) Booking source variant
-- explicitly rather than silently creating duplicate bookable Academy groups.
DO $academy$
DECLARE
  changed_rows integer;
BEGIN
  IF (SELECT count(*) FROM public.skill_levels
      WHERE (id='ski_schwarzer_koenig' AND name='Schwarzer König/Königin' AND is_active=false)
         OR (id='ski_academy' AND name='Swiss Snow Academy Ski' AND is_active=true)) <> 2
     OR (SELECT count(*) FROM public.group_courses
      WHERE (id='ca60dd81-0166-894e-5dc3-628f235942f2'::uuid
              AND name='26/27 Ski Schwarzer König/Königin'
              AND skill_level_id='ski_schwarzer_koenig' AND is_active=false)
         OR (id='d054979d-17df-fdbf-406b-b6355f347740'::uuid
              AND name='26/27 Samstag Ski Schwarzer König/Königin'
              AND skill_level_id='ski_schwarzer_koenig' AND is_active=false)
         OR (id='6f66d2ba-23a2-1e8b-58d4-ce4ca08ee20c'::uuid
              AND name='26/27 Ski Swiss Snow Academy'
              AND skill_level_id='ski_academy' AND is_active=false)
         OR (id='25e43ed3-8b7a-27f0-bf8b-adda19392c6c'::uuid
              AND name='26/27 Samstag Ski Swiss Snow Academy'
              AND skill_level_id='ski_academy' AND is_active=false)) <> 4
  THEN
    RAISE EXCEPTION 'Swiss Snow Academy: level/course preimage differs; nothing changed';
  END IF;

  UPDATE public.skill_levels
     SET name='Swiss Snow Academy Ski'
   WHERE id='ski_schwarzer_koenig' AND name='Schwarzer König/Königin' AND is_active=false;
  GET DIAGNOSTICS changed_rows=ROW_COUNT;
  IF changed_rows<>1 THEN RAISE EXCEPTION 'Swiss Snow Academy: level update drift'; END IF;

  UPDATE public.group_courses
     SET name=CASE id
       WHEN 'ca60dd81-0166-894e-5dc3-628f235942f2'::uuid
         THEN '26/27 Ski Swiss Snow Academy – Booking-Altvariante'
       WHEN 'd054979d-17df-fdbf-406b-b6355f347740'::uuid
         THEN '26/27 Samstag Ski Swiss Snow Academy – Booking-Altvariante'
       END
   WHERE id IN ('ca60dd81-0166-894e-5dc3-628f235942f2'::uuid,
                'd054979d-17df-fdbf-406b-b6355f347740'::uuid)
     AND skill_level_id='ski_schwarzer_koenig' AND is_active=false;
  GET DIAGNOSTICS changed_rows=ROW_COUNT;
  IF changed_rows<>2 THEN RAISE EXCEPTION 'Swiss Snow Academy: course update drift'; END IF;
END;
$academy$;
