-- B09 rollback: restore the global unique-lunch lookup body (group_lunch_full_day state).
-- Function body only; no data, lunch lines or history touched. Install consumer rollback first.
DO $rb$
DECLARE
  body text;
  s_from text; s_to text;
BEGIN
  body := pg_get_functiondef('public.bc_2627_staff_group_book(jsonb,uuid)'::regprocedure);
  IF strpos(body, 'lunch_season') = 0 THEN RAISE NOTICE 'B09 patch not installed; nothing to do'; RETURN; END IF;
  body := replace(body, ' v_ls_start date; v_ls_end date;', '');
  body := replace(body, '  -- B09: lunch product resolved per line from the booked course season (lunch_season).', '  IF v_any_lunch THEN
    SELECT count(*), max(id::text)::uuid, max(price) INTO v_lunch_n, v_lunch_product, v_lunch_price
      FROM public.products WHERE type = ''lunch'' AND is_active IS TRUE;
    IF v_lunch_n <> 1 OR v_lunch_price IS DISTINCT FROM 30::numeric THEN
      RETURN jsonb_build_object(''error'', ''invalid'', ''field'', ''lunch_product'');
    END IF;
  END IF;');
  s_from := strpos(body, '    v_lunch_product := NULL; v_lunch_price := NULL;')::text;
  s_to := strpos(body, '    v_veg := cardinality(v_lunch) > 0')::text;
  IF s_from::int = 0 OR s_to::int <= s_from::int THEN RAISE EXCEPTION 'Unexpected body; rollback aborted'; END IF;
  body := overlay(body placing '' from s_from::int for (s_to::int - s_from::int));
  EXECUTE body;
END $rb$;
