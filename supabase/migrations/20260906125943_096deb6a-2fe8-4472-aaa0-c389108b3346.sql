-- 1. Normalisierung -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.yeti_normalize(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    btrim(lower(translate(replace(coalesce(t, ''), 'ß', 'ss'),
      'äöüáàâãåéèêëíìîïóòôõúùûñçÄÖÜÁÀÂÃÅÉÈÊËÍÌÎÏÓÒÔÕÚÙÛÑÇ',
      'aouaaaaaeeeeiiiioooouuuncAOUAAAAAEEEEIIIIOOOOUUUNC'))),
    '\s+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.yeti_digits(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g')
$$;

-- 2. Lifecycle-Felder ------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_by uuid,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.customer_participants
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.customer_participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_by uuid,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customers_is_archived ON public.customers(is_archived);
CREATE INDEX IF NOT EXISTS idx_participants_is_archived ON public.customer_participants(is_archived);

-- 3. Merge-Audit -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('customer', 'participant')),
  source_id uuid NOT NULL,
  target_id uuid NOT NULL,
  field_resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
  relationship_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  rollback_until timestamptz,
  rolled_back_by uuid,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.entity_merges TO authenticated;
GRANT ALL ON public.entity_merges TO service_role;
ALTER TABLE public.entity_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view merges" ON public.entity_merges;
CREATE POLICY "Staff can view merges" ON public.entity_merges
  FOR SELECT TO authenticated USING (public.is_admin_or_office(auth.uid()));

DROP TRIGGER IF EXISTS update_entity_merges_updated_at ON public.entity_merges;
CREATE TRIGGER update_entity_merges_updated_at BEFORE UPDATE ON public.entity_merges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_entity_merges_source ON public.entity_merges(source_id);
CREATE INDEX IF NOT EXISTS idx_entity_merges_target ON public.entity_merges(target_id);

-- 4. Suche -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_customers(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  customer_number text,
  first_name text,
  last_name text,
  organization_name text,
  customer_type text,
  email text,
  phone text,
  city text,
  country text,
  participant_names text[],
  match_reason text,
  match_rank integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm text := public.yeti_normalize(p_query);
  v_tokens text[];
  v_digits text := public.yeti_digits(p_query);
BEGIN
  IF v_norm IS NULL OR length(v_norm) < 2 THEN
    RETURN;
  END IF;
  v_tokens := string_to_array(v_norm, ' ');

  RETURN QUERY
  WITH base AS (
    SELECT c.id, c.customer_number, c.first_name, c.last_name, c.organization_name,
           c.customer_type, c.email, c.phone, c.city, c.country,
           public.yeti_normalize(coalesce(c.first_name, '') || ' ' || c.last_name || ' ' ||
             coalesce(c.last_name, '') || ' ' || coalesce(c.first_name, '') || ' ' ||
             coalesce(c.organization_name, '') || ' ' || coalesce(c.email, '') || ' ' ||
             coalesce(c.billing_email, '') || ' ' || coalesce(c.customer_number, '')) AS hay,
           public.yeti_digits(coalesce(c.phone, '')) || ' ' ||
             public.yeti_digits(coalesce(c.additional_phones::text, '')) AS phone_hay,
           lower(coalesce(c.customer_number, '')) AS cnum,
           lower(coalesce(c.email, '')) AS cmail
    FROM public.customers c
    WHERE c.is_archived = false
  ),
  parts AS (
    SELECT p.customer_id,
           array_agg(btrim(p.first_name || ' ' || coalesce(p.last_name, '')) ORDER BY p.first_name) AS names,
           array_agg(public.yeti_normalize(p.first_name || ' ' || coalesce(p.last_name, ''))) AS norm_names
    FROM public.customer_participants p
    WHERE p.is_archived = false
    GROUP BY p.customer_id
  ),
  candidates AS (
    SELECT b.*, pa.names, pa.norm_names,
      -- alle Tokens im Kundendatensatz?
      (SELECT bool_and(b.hay LIKE '%' || tk || '%') FROM unnest(v_tokens) tk) AS all_in_customer,
      -- alle Tokens in Kunde + genau einem Teilnehmer?
      EXISTS (
        SELECT 1 FROM unnest(coalesce(pa.norm_names, ARRAY[]::text[])) pn
        WHERE (SELECT bool_and((b.hay || ' ' || pn) LIKE '%' || tk || '%') FROM unnest(v_tokens) tk)
      ) AS all_with_participant,
      EXISTS (
        SELECT 1 FROM unnest(coalesce(pa.norm_names, ARRAY[]::text[])) pn
        WHERE pn = v_norm
      ) AS participant_exact,
      (length(v_digits) >= 5 AND b.phone_hay LIKE '%' || v_digits || '%') AS phone_hit
    FROM base b
    LEFT JOIN parts pa ON pa.customer_id = b.id
  )
  SELECT c.id, c.customer_number, c.first_name, c.last_name, c.organization_name,
         c.customer_type, c.email, c.phone, c.city, c.country,
         coalesce(c.names, ARRAY[]::text[]) AS participant_names,
         CASE
           WHEN c.cnum = v_norm THEN 'Kundennummer ' || c.customer_number
           WHEN c.cmail = v_norm THEN 'E-Mail-Treffer'
           WHEN c.phone_hit THEN 'Telefonnummer-Treffer'
           WHEN c.participant_exact THEN 'Gefunden über Teilnehmer/in ' ||
             (SELECT n FROM unnest(c.names) WITH ORDINALITY AS t(n, i)
              WHERE public.yeti_normalize(n) = v_norm LIMIT 1)
           WHEN c.all_in_customer THEN 'Namenstreffer'
           WHEN c.all_with_participant THEN 'Gefunden über Teilnehmer/in ' ||
             coalesce((SELECT n FROM unnest(c.names) WITH ORDINALITY AS t(n, i)
              WHERE (SELECT bool_and((c.hay || ' ' || public.yeti_normalize(n)) LIKE '%' || tk || '%')
                     FROM unnest(v_tokens) tk) LIMIT 1), '')
           ELSE 'Treffer'
         END AS match_reason,
         CASE
           WHEN c.cnum = v_norm THEN 1
           WHEN c.cmail = v_norm OR c.phone_hit THEN 2
           WHEN c.all_in_customer AND public.yeti_normalize(coalesce(c.first_name, '') || ' ' || c.last_name) = v_norm THEN 3
           WHEN c.all_in_customer AND public.yeti_normalize(c.last_name || ' ' || coalesce(c.first_name, '')) = v_norm THEN 3
           WHEN c.participant_exact THEN 4
           WHEN c.hay LIKE v_norm || '%' THEN 5
           ELSE 6
         END::integer AS match_rank
  FROM candidates c
  WHERE c.all_in_customer OR c.all_with_participant OR c.phone_hit
  ORDER BY match_rank, c.last_name, c.first_name
  LIMIT greatest(1, coalesce(p_limit, 20));
END;
$$;

REVOKE ALL ON FUNCTION public.search_customers(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.search_customers(text, integer) TO authenticated, service_role;

-- 5. Vorschau --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_customer_merge(p_source_id uuid, p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_counts jsonb;
  v_dupes jsonb;
  v_credit numeric;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT jsonb_build_object(
    'participants', (SELECT count(*) FROM public.customer_participants WHERE customer_id = p_source_id AND is_archived = false),
    'tickets', (SELECT count(*) FROM public.tickets WHERE customer_id = p_source_id),
    'invoices', (SELECT count(*) FROM public.invoices WHERE customer_id = p_source_id),
    'customer_credits', (SELECT count(*) FROM public.customer_credits WHERE customer_id = p_source_id),
    'refund_requests', (SELECT count(*) FROM public.refund_requests WHERE customer_id = p_source_id),
    'vouchers', (SELECT count(*) FROM public.vouchers WHERE buyer_customer_id = p_source_id),
    'customer_contacts', (SELECT count(*) FROM public.customer_contacts WHERE customer_id = p_source_id),
    'conversations', (SELECT count(*) FROM public.conversations WHERE customer_id = p_source_id OR matched_customer_id = p_source_id)
  ) INTO v_counts;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'source_participant_id', s.id,
    'source_name', btrim(s.first_name || ' ' || coalesce(s.last_name, '')),
    'target_participant_id', t.id,
    'target_name', btrim(t.first_name || ' ' || coalesce(t.last_name, '')),
    'birth_date', s.birth_date
  )), '[]'::jsonb) INTO v_dupes
  FROM public.customer_participants s
  JOIN public.customer_participants t
    ON t.customer_id = p_target_id
   AND t.is_archived = false
   AND public.yeti_normalize(t.first_name) = public.yeti_normalize(s.first_name)
   AND t.birth_date = s.birth_date
  WHERE s.customer_id = p_source_id AND s.is_archived = false;

  SELECT coalesce(sum(remaining_amount), 0) INTO v_credit
  FROM public.customer_credits
  WHERE customer_id IN (p_source_id, p_target_id) AND coalesce(status, 'active') = 'active';

  RETURN jsonb_build_object(
    'counts', v_counts,
    'duplicate_participants', v_dupes,
    'resulting_credit_balance', v_credit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_customer_merge(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.preview_customer_merge(uuid, uuid) TO authenticated, service_role;

-- 6. Teilnehmer-Merge ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_participants(
  p_source_id uuid,
  p_target_id uuid,
  p_fields jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source public.customer_participants%ROWTYPE;
  v_target public.customer_participants%ROWTYPE;
  v_before jsonb;
  v_rel jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_merge_id uuid;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung für das Zusammenführen';
  END IF;
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Quelle und Ziel dürfen nicht identisch sein';
  END IF;

  SELECT * INTO v_source FROM public.customer_participants WHERE id = p_source_id FOR UPDATE;
  SELECT * INTO v_target FROM public.customer_participants WHERE id = p_target_id FOR UPDATE;
  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Teilnehmer nicht gefunden';
  END IF;
  IF v_source.is_archived OR v_target.is_archived THEN
    RAISE EXCEPTION 'Ein Datensatz wurde bereits zusammengeführt';
  END IF;
  IF v_source.customer_id <> v_target.customer_id THEN
    RAISE EXCEPTION 'Teilnehmer gehören zu unterschiedlichen Kunden';
  END IF;

  v_before := to_jsonb(v_target);

  UPDATE public.customer_participants SET
    first_name = coalesce(p_fields->>'first_name', first_name),
    last_name = CASE WHEN p_fields ? 'last_name' THEN p_fields->>'last_name' ELSE last_name END,
    birth_date = coalesce((p_fields->>'birth_date')::date, birth_date),
    sport = CASE WHEN p_fields ? 'sport' THEN p_fields->>'sport' ELSE sport END,
    level_last_season = CASE WHEN p_fields ? 'level_last_season' THEN p_fields->>'level_last_season' ELSE level_last_season END,
    level_current_season = CASE WHEN p_fields ? 'level_current_season' THEN p_fields->>'level_current_season' ELSE level_current_season END,
    current_ski_level_id = CASE WHEN p_fields ? 'current_ski_level_id' THEN p_fields->>'current_ski_level_id' ELSE current_ski_level_id END,
    current_snowboard_level_id = CASE WHEN p_fields ? 'current_snowboard_level_id' THEN p_fields->>'current_snowboard_level_id' ELSE current_snowboard_level_id END,
    self_assessed_ski_level = CASE WHEN p_fields ? 'self_assessed_ski_level' THEN p_fields->>'self_assessed_ski_level' ELSE self_assessed_ski_level END,
    self_assessed_snowboard_level = CASE WHEN p_fields ? 'self_assessed_snowboard_level' THEN p_fields->>'self_assessed_snowboard_level' ELSE self_assessed_snowboard_level END,
    notes = CASE WHEN p_fields ? 'notes' THEN p_fields->>'notes' ELSE notes END
  WHERE id = p_target_id;

  WITH moved AS (
    UPDATE public.ticket_items SET participant_id = p_target_id WHERE participant_id = p_source_id RETURNING id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('ticket_items.participant_id', v_ids);

  WITH moved AS (
    UPDATE public.participant_level_history SET participant_id = p_target_id WHERE participant_id = p_source_id RETURNING id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('participant_level_history.participant_id', v_ids);

  WITH moved AS (
    UPDATE public.participant_transfer_requests SET participant_id = p_target_id WHERE participant_id = p_source_id RETURNING id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('participant_transfer_requests.participant_id', v_ids);

  -- nur Anmeldungen übertragen, die beim Ziel noch nicht existieren
  WITH moved AS (
    UPDATE public.group_course_enrollments e SET participant_id = p_target_id
    WHERE e.participant_id = p_source_id
      AND NOT EXISTS (
        SELECT 1 FROM public.group_course_enrollments x
        WHERE x.participant_id = p_target_id AND x.instance_id IS NOT DISTINCT FROM e.instance_id
      )
    RETURNING e.id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('group_course_enrollments.participant_id', v_ids);

  WITH moved AS (
    UPDATE public.event_participants ep SET participant_id = p_target_id
    WHERE ep.participant_id = p_source_id
      AND NOT EXISTS (
        SELECT 1 FROM public.event_participants x
        WHERE x.participant_id = p_target_id AND x.event_id = ep.event_id
      )
    RETURNING ep.id
  ) SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('event_participants.participant_id', v_ids);

  UPDATE public.customer_participants
  SET is_archived = true, merged_into_id = p_target_id, merged_at = now(), merged_by = auth.uid()
  WHERE id = p_source_id;

  INSERT INTO public.entity_merges (entity_type, source_id, target_id, field_resolution, relationship_summary, performed_by, rollback_until)
  VALUES ('participant', p_source_id, p_target_id,
          jsonb_build_object('applied', p_fields, 'target_before', v_before),
          v_rel, auth.uid(), now() + interval '24 hours')
  RETURNING id INTO v_merge_id;

  RETURN jsonb_build_object('success', true, 'merge_id', v_merge_id, 'relationships', v_rel);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_participants(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.merge_participants(uuid, uuid, jsonb) TO authenticated, service_role;

-- 7. Kunden-Merge ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_customers(
  p_source_id uuid,
  p_target_id uuid,
  p_fields jsonb DEFAULT '{}'::jsonb,
  p_participant_merges jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source public.customers%ROWTYPE;
  v_target public.customers%ROWTYPE;
  v_before jsonb;
  v_rel jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_merge_id uuid;
  v_dupes integer;
  v_pm jsonb;
  v_source_email text;
  v_email_parked text;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung für das Zusammenführen';
  END IF;
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Quelle und Ziel dürfen nicht identisch sein';
  END IF;

  IF p_source_id < p_target_id THEN
    SELECT * INTO v_source FROM public.customers WHERE id = p_source_id FOR UPDATE;
    SELECT * INTO v_target FROM public.customers WHERE id = p_target_id FOR UPDATE;
  ELSE
    SELECT * INTO v_target FROM public.customers WHERE id = p_target_id FOR UPDATE;
    SELECT * INTO v_source FROM public.customers WHERE id = p_source_id FOR UPDATE;
  END IF;

  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Kunde nicht gefunden';
  END IF;
  IF v_source.is_archived OR v_target.is_archived THEN
    RAISE EXCEPTION 'Ein Datensatz wurde bereits zusammengeführt';
  END IF;

  -- Teilnehmer-Dubletten zuerst auflösen
  FOR v_pm IN SELECT * FROM jsonb_array_elements(coalesce(p_participant_merges, '[]'::jsonb))
  LOOP
    UPDATE public.customer_participants SET customer_id = p_target_id
    WHERE id = (v_pm->>'source_participant_id')::uuid AND customer_id = p_source_id;
    PERFORM public.merge_participants(
      (v_pm->>'source_participant_id')::uuid,
      (v_pm->>'target_participant_id')::uuid,
      coalesce(v_pm->'fields', '{}'::jsonb));
  END LOOP;

  SELECT count(*) INTO v_dupes
  FROM public.customer_participants s
  JOIN public.customer_participants t
    ON t.customer_id = p_target_id AND t.is_archived = false
   AND public.yeti_normalize(t.first_name) = public.yeti_normalize(s.first_name)
   AND t.birth_date = s.birth_date
  WHERE s.customer_id = p_source_id AND s.is_archived = false;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'PARTICIPANT_CONFLICT: % mögliche Teilnehmer-Dubletten müssen zuerst geklärt werden', v_dupes;
  END IF;

  v_before := to_jsonb(v_target);
  v_source_email := v_source.email;

  -- Eindeutigkeitskonflikt E-Mail: Quelle zuerst freigeben
  IF p_fields ? 'email' AND lower(p_fields->>'email') = lower(v_source.email) THEN
    v_email_parked := 'merged-' || p_source_id::text || '@archiv.local';
    UPDATE public.customers SET email = v_email_parked WHERE id = p_source_id;
  END IF;

  UPDATE public.customers SET
    first_name = CASE WHEN p_fields ? 'first_name' THEN p_fields->>'first_name' ELSE first_name END,
    last_name = coalesce(p_fields->>'last_name', last_name),
    email = coalesce(p_fields->>'email', email),
    billing_email = CASE WHEN p_fields ? 'billing_email' THEN p_fields->>'billing_email' ELSE billing_email END,
    phone = CASE WHEN p_fields ? 'phone' THEN p_fields->>'phone' ELSE phone END,
    additional_phones = CASE WHEN p_fields ? 'additional_phones' THEN p_fields->'additional_phones' ELSE additional_phones END,
    additional_emails = CASE WHEN p_fields ? 'additional_emails' THEN p_fields->'additional_emails' ELSE additional_emails END,
    street = CASE WHEN p_fields ? 'street' THEN p_fields->>'street' ELSE street END,
    zip = CASE WHEN p_fields ? 'zip' THEN p_fields->>'zip' ELSE zip END,
    city = CASE WHEN p_fields ? 'city' THEN p_fields->>'city' ELSE city END,
    country = CASE WHEN p_fields ? 'country' THEN p_fields->>'country' ELSE country END,
    holiday_address = coalesce(p_fields->>'holiday_address', holiday_address),
    language = CASE WHEN p_fields ? 'language' THEN p_fields->>'language' ELSE language END,
    preferred_channel = CASE WHEN p_fields ? 'preferred_channel' THEN p_fields->>'preferred_channel' ELSE preferred_channel END,
    customer_type = CASE WHEN p_fields ? 'customer_type' THEN p_fields->>'customer_type' ELSE customer_type END,
    organization_name = CASE WHEN p_fields ? 'organization_name' THEN p_fields->>'organization_name' ELSE organization_name END,
    notes = CASE WHEN p_fields ? 'notes' THEN p_fields->>'notes' ELSE notes END,
    -- Einwilligung wird nie durch das Zusammenführen erhöht
    marketing_consent = (coalesce(v_target.marketing_consent, false) AND coalesce(v_source.marketing_consent, false))
  WHERE id = p_target_id;

  WITH moved AS (UPDATE public.customer_participants SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('customer_participants.customer_id', v_ids);

  WITH moved AS (UPDATE public.tickets SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('tickets.customer_id', v_ids);

  WITH moved AS (UPDATE public.invoices SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('invoices.customer_id', v_ids);

  WITH moved AS (UPDATE public.customer_credits SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('customer_credits.customer_id', v_ids);

  WITH moved AS (UPDATE public.refund_requests SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('refund_requests.customer_id', v_ids);

  WITH moved AS (UPDATE public.vouchers SET buyer_customer_id = p_target_id WHERE buyer_customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('vouchers.buyer_customer_id', v_ids);

  WITH moved AS (UPDATE public.customer_contacts SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('customer_contacts.customer_id', v_ids);

  WITH moved AS (UPDATE public.conversations SET customer_id = p_target_id WHERE customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('conversations.customer_id', v_ids);

  WITH moved AS (UPDATE public.conversations SET matched_customer_id = p_target_id WHERE matched_customer_id = p_source_id RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM moved;
  v_rel := v_rel || jsonb_build_object('conversations.matched_customer_id', v_ids);

  UPDATE public.customers
  SET is_archived = true, merged_into_id = p_target_id, merged_at = now(), merged_by = auth.uid()
  WHERE id = p_source_id;

  INSERT INTO public.entity_merges (entity_type, source_id, target_id, field_resolution, relationship_summary, performed_by, rollback_until)
  VALUES ('customer', p_source_id, p_target_id,
          jsonb_build_object(
            'applied', p_fields,
            'target_before', v_before,
            'source_customer_number_alias', v_source.customer_number,
            'source_email_before', v_source_email,
            'source_email_parked', v_email_parked),
          v_rel, auth.uid(), now() + interval '24 hours')
  RETURNING id INTO v_merge_id;

  RETURN jsonb_build_object('success', true, 'merge_id', v_merge_id, 'target_id', p_target_id, 'relationships', v_rel);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid, jsonb, jsonb) TO authenticated, service_role;

-- 8. Rücknahme -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_entity_merge(p_merge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m public.entity_merges%ROWTYPE;
  v_key text;
  v_tbl text;
  v_col text;
  v_ids uuid[];
  v_before jsonb;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT * INTO v_m FROM public.entity_merges WHERE id = p_merge_id FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Zusammenführung nicht gefunden'; END IF;
  IF v_m.rolled_back_at IS NOT NULL THEN RAISE EXCEPTION 'Diese Zusammenführung wurde bereits zurückgenommen'; END IF;
  IF v_m.rollback_until IS NULL OR now() > v_m.rollback_until THEN
    RAISE EXCEPTION 'Die Rücknahmefrist von 24 Stunden ist abgelaufen';
  END IF;

  v_before := v_m.field_resolution->'target_before';

  IF v_m.entity_type = 'customer' THEN
    IF EXISTS (SELECT 1 FROM public.customers WHERE id = v_m.target_id AND (is_archived OR merged_into_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Der bleibende Kunde wurde inzwischen selbst zusammengeführt – Rücknahme nicht möglich';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tickets WHERE customer_id = v_m.target_id
               AND created_at > v_m.performed_at
               AND NOT (id::text IN (SELECT jsonb_array_elements_text(coalesce(v_m.relationship_summary->'tickets.customer_id', '[]'::jsonb))))) THEN
      RAISE EXCEPTION 'Seit der Zusammenführung wurden neue Buchungen erfasst – Rücknahme blockiert';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.customer_participants WHERE id = v_m.target_id AND (is_archived OR merged_into_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Der bleibende Teilnehmer wurde inzwischen selbst zusammengeführt – Rücknahme nicht möglich';
    END IF;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_m.relationship_summary)
  LOOP
    v_tbl := split_part(v_key, '.', 1);
    v_col := split_part(v_key, '.', 2);
    SELECT array_agg(x::uuid) INTO v_ids
    FROM jsonb_array_elements_text(v_m.relationship_summary->v_key) x;
    IF v_ids IS NULL THEN CONTINUE; END IF;

    CASE v_key
      WHEN 'customer_participants.customer_id' THEN UPDATE public.customer_participants SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'tickets.customer_id' THEN UPDATE public.tickets SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'invoices.customer_id' THEN UPDATE public.invoices SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'customer_credits.customer_id' THEN UPDATE public.customer_credits SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'refund_requests.customer_id' THEN UPDATE public.refund_requests SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'vouchers.buyer_customer_id' THEN UPDATE public.vouchers SET buyer_customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'customer_contacts.customer_id' THEN UPDATE public.customer_contacts SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'conversations.customer_id' THEN UPDATE public.conversations SET customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'conversations.matched_customer_id' THEN UPDATE public.conversations SET matched_customer_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'ticket_items.participant_id' THEN UPDATE public.ticket_items SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'participant_level_history.participant_id' THEN UPDATE public.participant_level_history SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'participant_transfer_requests.participant_id' THEN UPDATE public.participant_transfer_requests SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'group_course_enrollments.participant_id' THEN UPDATE public.group_course_enrollments SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      WHEN 'event_participants.participant_id' THEN UPDATE public.event_participants SET participant_id = v_m.source_id WHERE id = ANY(v_ids);
      ELSE RAISE EXCEPTION 'Unbekannte Beziehung %, Rücknahme abgebrochen', v_key;
    END CASE;
  END LOOP;

  IF v_m.entity_type = 'customer' THEN
    UPDATE public.customers SET
      first_name = v_before->>'first_name',
      last_name = v_before->>'last_name',
      email = v_before->>'email',
      billing_email = v_before->>'billing_email',
      phone = v_before->>'phone',
      additional_phones = v_before->'additional_phones',
      additional_emails = v_before->'additional_emails',
      street = v_before->>'street',
      zip = v_before->>'zip',
      city = v_before->>'city',
      country = v_before->>'country',
      holiday_address = coalesce(v_before->>'holiday_address', holiday_address),
      language = v_before->>'language',
      preferred_channel = v_before->>'preferred_channel',
      customer_type = v_before->>'customer_type',
      organization_name = v_before->>'organization_name',
      notes = v_before->>'notes',
      marketing_consent = (v_before->>'marketing_consent')::boolean
    WHERE id = v_m.target_id;

    UPDATE public.customers SET
      is_archived = false, merged_into_id = NULL, merged_at = NULL, merged_by = NULL,
      email = coalesce(v_m.field_resolution->>'source_email_before', email)
    WHERE id = v_m.source_id;
  ELSE
    UPDATE public.customer_participants SET
      first_name = v_before->>'first_name',
      last_name = v_before->>'last_name',
      birth_date = (v_before->>'birth_date')::date,
      sport = v_before->>'sport',
      level_last_season = v_before->>'level_last_season',
      level_current_season = v_before->>'level_current_season',
      current_ski_level_id = v_before->>'current_ski_level_id',
      current_snowboard_level_id = v_before->>'current_snowboard_level_id',
      self_assessed_ski_level = v_before->>'self_assessed_ski_level',
      self_assessed_snowboard_level = v_before->>'self_assessed_snowboard_level',
      notes = v_before->>'notes'
    WHERE id = v_m.target_id;

    UPDATE public.customer_participants SET
      is_archived = false, merged_into_id = NULL, merged_at = NULL, merged_by = NULL
    WHERE id = v_m.source_id;
  END IF;

  UPDATE public.entity_merges SET rolled_back_at = now(), rolled_back_by = auth.uid() WHERE id = p_merge_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_entity_merge(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rollback_entity_merge(uuid) TO authenticated, service_role;