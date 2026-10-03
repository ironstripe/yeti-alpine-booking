-- Swiss Snow League 2026: current labels, stable IDs and untouched historical bookings.
-- Sources: https://swiss-snow-league.ch/league/ski/swiss-snow-academy/rookie
--          https://swiss-snow-league.ch/league/snowboard/red-academy
--          https://www.swiss-ski-school.ch/children/swiss-snow-league/
-- Do not infer a new official level for Booking's separate "Schwarzer König" offer.
DO $ssl_2026$
DECLARE n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('yeti-ssl-2026-labels'));
  IF (SELECT count(*) FROM public.skill_levels WHERE (id,name,is_active) IN (
    ('ski_schwarzer_prinz','Schwarzer Prinz/Prinzessin',true),
    ('ski_schwarzer_koenig','Schwarzer König/Königin',true),
    ('ski_academy','Academy Ski',true),
    ('sb_roter_prinz','Roter Prinz/Prinzessin',true),
    ('sb_roter_koenig','Roter König/Königin',true),
    ('sb_roter_star','Roter Star',true),
    ('sb_academy','Academy Snowboard',true))) <> 7
    OR NOT EXISTS (SELECT 1 FROM public.skill_levels
                   WHERE id='sb_blauer_star' AND next_level_id='sb_roter_prinz')
    OR EXISTS (SELECT 1 FROM public.skill_levels WHERE id='sb_red_academy')
    OR (SELECT count(*) FROM public.group_courses
        WHERE skill_level_id='ski_schwarzer_prinz' AND is_active=false
          AND name IN ('26/27 Ski Schwarzer Prinz/Prinzessin',
                       '26/27 Samstag Ski Schwarzer Prinz/Prinzessin')) <> 2
  THEN RAISE EXCEPTION 'Swiss Snow League 2026: level/course preimage drift'; END IF;

  UPDATE public.skill_levels SET name='Academy Rookie'
   WHERE id='ski_schwarzer_prinz';
  UPDATE public.skill_levels SET name='Swiss Snow Academy Ski'
   WHERE id='ski_academy';
  UPDATE public.skill_levels SET name='Swiss Snow Academy Snowboard'
   WHERE id='sb_academy';
  -- Booking-Corner's "Schwarzer König" has no verified 1:1 successor. Retain
  -- its ID and inactive 26/27 drafts, but remove the obsolete level from choices.
  UPDATE public.skill_levels SET is_active=false
   WHERE id='ski_schwarzer_koenig';

  INSERT INTO public.skill_levels
    (id,name,discipline,target_group,color,sort_order,short_description,description,
     next_level_id,min_age,max_age,is_active)
  VALUES
    ('sb_red_academy','Red Academy','snowboard','child','red',5,
     'Snowboard: Red Academy',
     'Aktuelle Swiss Snow League: Red Academy nach Blue League und vor Swiss Snow Academy.',
     'sb_academy',NULL,NULL,true);
  UPDATE public.skill_levels SET next_level_id='sb_red_academy'
   WHERE id='sb_blauer_star' AND next_level_id='sb_roter_prinz';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Swiss Snow League 2026: snowboard progression drift'; END IF;
  -- Three former red Snowboard badges remain addressable on historical
  -- participants, but are no longer selectable as CURRENT Swiss Snow League levels.
  UPDATE public.skill_levels SET is_active=false
   WHERE id IN ('sb_roter_prinz','sb_roter_koenig','sb_roter_star');
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>3 THEN RAISE EXCEPTION 'Swiss Snow League 2026: legacy snowboard drift'; END IF;

  UPDATE public.group_courses
     SET name=replace(name,'Ski Schwarzer Prinz/Prinzessin','Ski Academy Rookie')
   WHERE skill_level_id='ski_schwarzer_prinz' AND is_active=false
     AND name IN ('26/27 Ski Schwarzer Prinz/Prinzessin',
                  '26/27 Samstag Ski Schwarzer Prinz/Prinzessin');
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'Swiss Snow League 2026: course rename drift'; END IF;
END;
$ssl_2026$;
