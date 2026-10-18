-- Effective, editable private-lesson sale prices (duration x persons) per product.
-- Separate from the immutable Booking-Corner originals in bc_product_tariff_sources.
-- Additive only: no backfill, no changes to existing tariffs, bookings or invoices.

CREATE TABLE public.product_private_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  duration_minutes integer NOT NULL,
  persons_per_lesson integer NOT NULL,
  price_chf numeric(10,2) NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT product_private_tariffs_duration_check
    CHECK (duration_minutes BETWEEN 60 AND 420 AND duration_minutes % 60 = 0),
  CONSTRAINT product_private_tariffs_persons_check
    CHECK (persons_per_lesson BETWEEN 1 AND 5),
  CONSTRAINT product_private_tariffs_price_check
    CHECK (price_chf > 0),
  CONSTRAINT product_private_tariffs_unique_cell
    UNIQUE (product_id, duration_minutes, persons_per_lesson)
);

COMMENT ON TABLE public.product_private_tariffs IS
  'Effective editable private-lesson sale prices per product (duration x persons). BC originals stay in bc_product_tariff_sources.';

GRANT SELECT ON public.product_private_tariffs TO authenticated;
GRANT ALL ON public.product_private_tariffs TO service_role;

ALTER TABLE public.product_private_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read private product tariffs"
  ON public.product_private_tariffs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Atomic authorized save of a private product's tariff matrix.
-- p_cells: jsonb array of {"duration_minutes":int,"persons_per_lesson":int,"price_chf":number|null}
--   price_chf > 0 upserts the cell; price_chf null removes the cell (no tariff for that combination).
-- The whole call is one transaction: any invalid cell rejects everything.
-- Idempotent: replaying the same payload yields the same stored matrix.
CREATE OR REPLACE FUNCTION public.save_product_private_tariffs(
  p_product_id uuid,
  p_cells jsonb,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product record;
  v_cell jsonb;
  v_duration integer;
  v_persons integer;
  v_price numeric(10,2);
  v_seen text[] := ARRAY[]::text[];
  v_key text;
BEGIN
  IF p_cells IS NULL OR jsonb_typeof(p_cells) <> 'array'
     OR jsonb_array_length(p_cells) > 35 THEN
    RAISE EXCEPTION 'Invalid tariff cells' USING ERRCODE = '22023';
  END IF;

  SELECT id, type, season_id INTO v_product
    FROM public.products
   WHERE id = p_product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = '22023';
  END IF;
  IF v_product.type <> 'private' OR v_product.season_id IS NULL THEN
    RAISE EXCEPTION 'Tariff matrix is only available for private products with a season'
      USING ERRCODE = '22023';
  END IF;

  FOR v_cell IN SELECT value FROM jsonb_array_elements(p_cells) LOOP
    IF jsonb_typeof(v_cell) <> 'object'
       OR COALESCE(v_cell->>'duration_minutes', '') !~ '^[0-9]+$'
       OR COALESCE(v_cell->>'persons_per_lesson', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Invalid tariff cell shape' USING ERRCODE = '22023';
    END IF;
    v_duration := (v_cell->>'duration_minutes')::integer;
    v_persons := (v_cell->>'persons_per_lesson')::integer;
    IF v_duration < 60 OR v_duration > 420 OR v_duration % 60 <> 0
       OR v_persons < 1 OR v_persons > 5 THEN
      RAISE EXCEPTION 'Duration/persons outside allowed tariff range'
        USING ERRCODE = '22023';
    END IF;
    v_key := v_duration || ':' || v_persons;
    IF v_seen @> ARRAY[v_key] THEN
      RAISE EXCEPTION 'Duplicate tariff cell' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_key);

    IF v_cell->>'price_chf' IS NULL OR jsonb_typeof(v_cell->'price_chf') = 'null' THEN
      DELETE FROM public.product_private_tariffs
       WHERE product_id = p_product_id
         AND duration_minutes = v_duration
         AND persons_per_lesson = v_persons;
    ELSE
      IF jsonb_typeof(v_cell->'price_chf') <> 'number' THEN
        RAISE EXCEPTION 'Invalid tariff price' USING ERRCODE = '22023';
      END IF;
      v_price := (v_cell->>'price_chf')::numeric(10,2);
      IF v_price <= 0 THEN
        RAISE EXCEPTION 'Tariff price must be positive' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.product_private_tariffs
        (product_id, duration_minutes, persons_per_lesson, price_chf, updated_by)
      VALUES (p_product_id, v_duration, v_persons, v_price, p_actor)
      ON CONFLICT (product_id, duration_minutes, persons_per_lesson)
      DO UPDATE SET price_chf = EXCLUDED.price_chf,
                    updated_at = now(),
                    updated_by = EXCLUDED.updated_by;
    END IF;
  END LOOP;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'duration_minutes', t.duration_minutes,
             'persons_per_lesson', t.persons_per_lesson,
             'price_chf', t.price_chf)
           ORDER BY t.duration_minutes, t.persons_per_lesson)
      FROM public.product_private_tariffs t
     WHERE t.product_id = p_product_id
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_product_private_tariffs(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_private_tariffs(uuid, jsonb, uuid) TO service_role;
