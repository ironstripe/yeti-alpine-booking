-- B09 PREPARATION ONLY (not installed): season-aware lunch product for bc_2627_staff_group_book.
-- Requires group_lunch_full_day.sql first (fails closed on any other function body).
-- Replaces the GLOBAL "exactly one active lunch product" lookup with a per-line lookup:
--   booked course -> group_courses.product_id -> products.season_id -> seasons (dates must lie inside)
--   -> exactly one active products(type='lunch', season_id = that season) at CHF 30.
-- Optional client lunch_product_id must equal the resolved row (forged/stale id rejected).
-- No tables, data, prices, grants or signature changes; existing lunch lines untouched.
-- Rollback: re-run supabase/pending/group_lunch_season_rollback.sql (restores the previous body).
DO $patch$
DECLARE
  body text;
  old_decl text := 'v_lunch_product uuid; v_lunch_price numeric; v_lunch_n int; v_any_lunch boolean := false;';
  old_pre text := '  IF v_any_lunch THEN
    SELECT count(*), max(id::text)::uuid, max(price) INTO v_lunch_n, v_lunch_product, v_lunch_price
      FROM public.products WHERE type = ''lunch'' AND is_active IS TRUE;
    IF v_lunch_n <> 1 OR v_lunch_price IS DISTINCT FROM 30::numeric THEN
      RETURN jsonb_build_object(''error'', ''invalid'', ''field'', ''lunch_product'');
    END IF;
  END IF;';
  old_days text := '    v_veg := cardinality(v_lunch) > 0 AND coalesce((e->>''vegetarian'')::boolean, false);';
BEGIN
  body := pg_get_functiondef('public.bc_2627_staff_group_book(jsonb,uuid)'::regprocedure);
  IF strpos(body, 'lunch_full_day') = 0 OR strpos(body, 'lunch_season') > 0
     OR strpos(body, old_decl) = 0 OR strpos(body, old_pre) = 0 OR strpos(body, old_days) = 0 THEN
    RAISE EXCEPTION 'Unexpected staff group booking body; season lunch patch not applied';
  END IF;
  body := replace(body, old_decl, old_decl || ' v_ls_start date; v_ls_end date;');
  -- Pre-pass keeps only the shape check; the product is resolved per line from the trusted course.
  body := replace(body, old_pre, '  -- B09: lunch product resolved per line from the booked course season (lunch_season).');
  body := replace(body, old_days, '    v_lunch_product := NULL; v_lunch_price := NULL;
    IF cardinality(v_lunch) > 0 THEN
      SELECT s.start_date, s.end_date INTO v_ls_start, v_ls_end
        FROM public.products bp JOIN public.seasons s ON s.id = bp.season_id
       WHERE bp.id = v_course.product_id;
      IF v_ls_start IS NULL OR v_ls_end IS NULL
         OR EXISTS (SELECT 1 FROM unnest(v_lunch) x WHERE x < v_ls_start OR x > v_ls_end) THEN
        RAISE EXCEPTION USING ERRCODE = ''P0001'', MESSAGE = ''lunch_season'', DETAIL = i::text;
      END IF;
      SELECT count(*), max(lp.id::text)::uuid, max(lp.price) INTO v_lunch_n, v_lunch_product, v_lunch_price
        FROM public.products bp JOIN public.products lp ON lp.season_id = bp.season_id
       WHERE bp.id = v_course.product_id AND lp.type = ''lunch'' AND lp.is_active IS TRUE;
      IF v_lunch_n <> 1 OR v_lunch_price IS DISTINCT FROM 30::numeric THEN
        RAISE EXCEPTION USING ERRCODE = ''P0001'', MESSAGE = ''lunch_product'', DETAIL = i::text;
      END IF;
      IF e ? ''lunch_product_id'' AND (e->>''lunch_product_id'') IS DISTINCT FROM v_lunch_product::text THEN
        RAISE EXCEPTION USING ERRCODE = ''P0001'', MESSAGE = ''lunch_product_mismatch'', DETAIL = i::text;
      END IF;
    END IF;
' || old_days);
  EXECUTE body;
END $patch$;
