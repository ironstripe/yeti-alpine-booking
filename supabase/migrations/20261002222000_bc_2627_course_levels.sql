-- Five exact target levels required by the source-backed 26/27 course manifest.
-- Ski adults are the explicit adult-group exception. Snowboard groups are youth.
-- No course, product, booking or instructor row is changed by this migration.
DO $bc_levels$
DECLARE v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('malbun-2627-course-levels'));
  SELECT count(*) INTO v_count FROM public.skill_levels
   WHERE id IN ('ski_schwarzer_koenig','ski_kids_advanced','ski_adult_returners',
                'sb_youth_beginner','sb_youth_advanced');
  IF v_count<>0 THEN
    RAISE EXCEPTION '26/27 course levels: target ID collision';
  END IF;
  -- Source-specific course categories; do not alias youth snowboard to adults.
  INSERT INTO public.skill_levels
    (id,name,discipline,target_group,color,sort_order,description,min_age,max_age,is_active)
  VALUES
    ('ski_schwarzer_koenig','Schwarzer König/Königin','ski','child','black',10,
     'Booking-Corner 26/27: Ski Schwarzer König/Königin.',0,16,true),
    ('ski_kids_advanced','Kinder Fortgeschritten','ski','child',NULL,12,
     'Booking-Corner 26/27: Ski Kinder Fortgeschritten.',0,16,true),
    ('ski_adult_returners','Erwachsene Wiedereinsteiger','ski','adult',NULL,10,
     'Booking-Corner 26/27: Ski Erwachsene Wiedereinsteiger.',17,NULL,true),
    ('sb_youth_beginner','Snowboard Anfänger (Jugend)','snowboard','child',NULL,9,
     'Booking-Corner 26/27: Snowboard Anfänger, Gruppenkurs bis und mit 16.',0,16,true),
    ('sb_youth_advanced','Snowboard Fortgeschritten (Jugend)','snowboard','child',NULL,10,
     'Booking-Corner 26/27: Snowboard Fortgeschritten, Gruppenkurs bis und mit 16.',0,16,true);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>5 THEN RAISE EXCEPTION '26/27 course levels: inserted %, expected 5',v_count; END IF;
END;
$bc_levels$;
