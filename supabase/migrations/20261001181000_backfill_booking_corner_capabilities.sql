-- Booking-Corner 2026/27 competency backfill. Apply once to YETI Cloud in one transaction.
-- Source: already imported private instructor_hr_private.assignments, NOT a new upload.
-- LIVE STATUS: APPLIED manually in YETI Lovable Cloud on 2026-10-01; do not rerun manually.
-- Expected source: 87 non-archived Booking-Corner links, 3,254 raw assignments,
-- 1,529 competency rows of which 8 are explicit "no entries" markers.
-- Source labels have priority over the nine pre-import YETI test assignments that
-- conflict; every YETI-only profile and every unrelated table remains untouched.
-- Wrap this file with BEGIN/COMMIT for live use, or BEGIN/ROLLBACK for a dry-run.

DO $preflight$
DECLARE
  v_people integer; v_links integer; v_private integer; v_raw integer;
  v_competency_rows integer; v_markers integer; v_real integer;
  v_labels integer; v_skilled integer; v_runs integer; v_hash_ok boolean;
  v_catalog integer; v_assignments integer; v_catalog_hash text; v_assignment_hash text;
  v_late integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('yeti_bc_2026_27_competencies'));
  SELECT count(*) INTO v_people FROM public.instructors;
  SELECT count(*) INTO v_links FROM public.instructor_source_links
    WHERE source_system = 'booking_corner' AND rollout = 'yeti_2026_27';
  SELECT count(*), coalesce(sum(jsonb_array_length(h.assignments)), 0)::integer
    INTO v_private, v_raw
    FROM public.instructor_hr_private h
    JOIN public.instructor_source_links l ON l.instructor_id = h.instructor_id
    WHERE l.source_system = 'booking_corner' AND l.rollout = 'yeti_2026_27';
  SELECT count(*), bool_and(xlsx_sha256 = '837367fa2c858961a4ca4148825384906d957847c8504525c03770323854eb7f')
    INTO v_runs, v_hash_ok FROM public.instructor_import_runs
    WHERE source_system = 'booking_corner' AND rollout = 'yeti_2026_27' AND status = 'applied';
  SELECT count(*), count(*) FILTER (WHERE a.value->>'value' = 'Keine Einträge in der Zusammenfassung'),
         count(*) FILTER (WHERE a.value->>'value' <> 'Keine Einträge in der Zusammenfassung'),
         count(DISTINCT a.value->>'value') FILTER (WHERE a.value->>'value' <> 'Keine Einträge in der Zusammenfassung'),
         count(DISTINCT l.instructor_id) FILTER (WHERE a.value->>'value' <> 'Keine Einträge in der Zusammenfassung')
    INTO v_competency_rows, v_markers, v_real, v_labels, v_skilled
    FROM public.instructor_source_links l
    JOIN public.instructor_hr_private h ON h.instructor_id = l.instructor_id
    CROSS JOIN LATERAL jsonb_array_elements(h.assignments) a
    WHERE l.source_system = 'booking_corner' AND l.rollout = 'yeti_2026_27'
      AND a.value->>'area' = 'Kompetenzen';
  SELECT count(*), md5(string_agg(id::text||':'||name||':'||coalesce(category,''), '|' ORDER BY id::text))
    INTO v_catalog, v_catalog_hash FROM public.capabilities;
  SELECT count(*), md5(string_agg(id::text||':'||instructor_id::text||':'||capability_id::text, '|' ORDER BY id::text)),
         count(*) FILTER (WHERE created_at >= timestamptz '2026-10-01 15:00:00+02')
    INTO v_assignments, v_assignment_hash, v_late FROM public.instructor_capabilities;
  IF v_people <> 98 OR v_links <> 87 OR v_private <> 87 OR v_raw <> 3254
     OR v_runs <> 2 OR v_hash_ok IS DISTINCT FROM true
     OR v_competency_rows <> 1529 OR v_markers <> 8 OR v_real <> 1521
     OR v_labels <> 29 OR v_skilled <> 79 THEN
    RAISE EXCEPTION 'competency_source_or_population_drift';
  END IF;
  -- First application: exact preimage and no post-import manual edits.
  IF v_catalog = 25 AND v_assignments = 20 THEN
    IF v_catalog_hash <> 'cf09e9bb13459a1ecd630e54f6a26c97'
       OR v_assignment_hash <> 'c430f392a05b33b0023da2a213336127'
       OR v_late <> 0 THEN
      RAISE EXCEPTION 'competency_target_preimage_drift';
    END IF;
  ELSIF v_catalog = 29 AND v_assignments = 1521 THEN
    -- The final comparison below also asserts exact equality on a repeated execution.
    NULL;
  ELSE
    RAISE EXCEPTION 'competency_target_count_drift: %, %', v_catalog, v_assignments;
  END IF;
END
$preflight$;

CREATE TEMP TABLE bc_competency_expected ON COMMIT DROP AS
  SELECT DISTINCT l.instructor_id, btrim(a.value->>'value') AS name
  FROM public.instructor_source_links l
  JOIN public.instructor_hr_private h ON h.instructor_id = l.instructor_id
  CROSS JOIN LATERAL jsonb_array_elements(h.assignments) a
  WHERE l.source_system = 'booking_corner' AND l.rollout = 'yeti_2026_27'
    AND a.value->>'area' = 'Kompetenzen'
    AND a.value->>'value' <> 'Keine Einträge in der Zusammenfassung';

DO $validate_source$
BEGIN
  IF (SELECT count(*) FROM bc_competency_expected) <> 1521
     OR EXISTS (SELECT 1 FROM bc_competency_expected WHERE name IS NULL OR name = '') THEN
    RAISE EXCEPTION 'competency_source_pairs_invalid';
  END IF;
END
$validate_source$;

-- Keep all 25 existing YETI names and UUIDs. These four names are verbatim in
-- Booking-Corner/XLSX; "Weitere" avoids inventing a ski-level or bus-driver licence.
INSERT INTO public.capabilities (name, category) VALUES
  ('Jugendhaus Fortgeschritten', 'Jugendhaus'),
  ('Bus', 'Weitere'),
  ('Erwachsene', 'Weitere'),
  ('Ladies', 'Weitere')
ON CONFLICT (name) DO NOTHING;

DO $validate_catalog$
BEGIN
  IF (SELECT count(*) FROM public.capabilities) <> 29
     OR EXISTS (
       SELECT 1 FROM bc_competency_expected e
       WHERE NOT EXISTS (SELECT 1 FROM public.capabilities c WHERE c.name = e.name)
     )
     OR EXISTS (
       SELECT 1 FROM (VALUES
         ('Jugendhaus Fortgeschritten', 'Jugendhaus'),
         ('Bus', 'Weitere'), ('Erwachsene', 'Weitere'), ('Ladies', 'Weitere')
       ) AS wanted(name, category)
       LEFT JOIN public.capabilities c ON c.name = wanted.name AND c.category = wanted.category
       WHERE c.id IS NULL
     ) THEN
    RAISE EXCEPTION 'competency_catalog_mapping_incomplete';
  END IF;
END
$validate_catalog$;

-- The one linked profile's 20 old YETI test assignments predate the real import.
-- Remove only its 9 labels absent from authoritative Booking-Corner 26/27.
DELETE FROM public.instructor_capabilities ic
USING public.instructor_source_links l, public.capabilities c
WHERE ic.instructor_id = l.instructor_id AND ic.capability_id = c.id
  AND l.source_system = 'booking_corner' AND l.rollout = 'yeti_2026_27'
  AND NOT EXISTS (
    SELECT 1 FROM bc_competency_expected e
    WHERE e.instructor_id = ic.instructor_id AND e.name = c.name
  );

INSERT INTO public.instructor_capabilities (instructor_id, capability_id)
SELECT e.instructor_id, c.id
FROM bc_competency_expected e JOIN public.capabilities c ON c.name = e.name
ON CONFLICT (instructor_id, capability_id) DO NOTHING;

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM public.instructors) <> 98
     OR (SELECT count(*) FROM public.capabilities) <> 29
     OR (SELECT count(*) FROM public.instructor_capabilities) <> 1521
     OR (SELECT count(DISTINCT instructor_id) FROM public.instructor_capabilities) <> 79
     OR EXISTS (
       SELECT 1 FROM bc_competency_expected e
       JOIN public.capabilities c ON c.name = e.name
       WHERE NOT EXISTS (
         SELECT 1 FROM public.instructor_capabilities ic
         WHERE ic.instructor_id = e.instructor_id AND ic.capability_id = c.id
       )
     )
     OR EXISTS (
       SELECT 1 FROM public.instructor_capabilities ic
       JOIN public.capabilities c ON c.id = ic.capability_id
       WHERE NOT EXISTS (
         SELECT 1 FROM bc_competency_expected e
         WHERE e.instructor_id = ic.instructor_id AND e.name = c.name
       )
     ) THEN
    RAISE EXCEPTION 'competency_postflight_failed';
  END IF;
END
$postflight$;

SELECT (SELECT count(*) FROM public.capabilities) AS capabilities,
       (SELECT count(*) FROM public.instructor_capabilities) AS assignments,
       (SELECT count(DISTINCT instructor_id) FROM public.instructor_capabilities) AS assigned_instructors,
       (SELECT count(*) FROM public.instructors) AS instructors,
       (SELECT count(*) FROM bc_competency_expected) AS source_pairs,
       true AS all_passed;
