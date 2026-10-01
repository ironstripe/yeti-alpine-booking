CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text IN ('admin','office','super_admin'))
$$;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- Stable login <-> instructor mapping
CREATE TABLE public.instructor_user_links (
  user_id uuid PRIMARY KEY,
  instructor_id uuid NOT NULL UNIQUE REFERENCES public.instructors(id) ON DELETE CASCADE,
  created_by uuid,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('email_backfill','invite','link','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.instructor_user_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_user_links TO authenticated;
GRANT ALL ON public.instructor_user_links TO service_role;
ALTER TABLE public.instructor_user_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iul_select_own_or_staff" ON public.instructor_user_links FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_instructor_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT l.instructor_id FROM public.instructor_user_links l WHERE l.user_id = _user_id),
    (SELECT CASE WHEN count(*) = 1 THEN min(i.id::text)::uuid END
       FROM public.instructors i JOIN auth.users u ON lower(u.email) = lower(i.email)
      WHERE u.id = _user_id
        AND NOT EXISTS (SELECT 1 FROM public.instructor_user_links l2 WHERE l2.instructor_id = i.id))
  )
$$;

-- PII-free realtime status
CREATE TABLE public.instructor_live_status (
  instructor_id uuid PRIMARY KEY REFERENCES public.instructors(id) ON DELETE CASCADE,
  real_time_status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.instructor_live_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_live_status TO authenticated;
GRANT ALL ON public.instructor_live_status TO service_role;
ALTER TABLE public.instructor_live_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ils_select_auth" ON public.instructor_live_status FOR SELECT TO authenticated USING (true);
ALTER TABLE public.instructor_live_status REPLICA IDENTITY FULL;
INSERT INTO public.instructor_live_status(instructor_id, real_time_status) SELECT id, real_time_status FROM public.instructors;

CREATE OR REPLACE FUNCTION public.instructors_sync_live_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.instructor_live_status(instructor_id, real_time_status, updated_at)
  VALUES (NEW.id, NEW.real_time_status, now())
  ON CONFLICT (instructor_id) DO UPDATE SET real_time_status = EXCLUDED.real_time_status, updated_at = now()
  WHERE public.instructor_live_status.real_time_status IS DISTINCT FROM EXCLUDED.real_time_status;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_instructors_sync_live_status AFTER INSERT OR UPDATE OF real_time_status ON public.instructors
  FOR EACH ROW EXECUTE FUNCTION public.instructors_sync_live_status();
ALTER PUBLICATION supabase_realtime ADD TABLE public.instructor_live_status;

-- Office/admin/super_admin operational projection (no pay/bank/AHV)
CREATE OR REPLACE FUNCTION public.instructors_ops_list(p_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, created_at timestamptz, first_name text, last_name text, level text, specialization text,
  status text, real_time_status text, languages text[], role text, roles text[], instructor_type public.instructor_role_type,
  gender text, avatar_url text, show_on_website boolean, website_teaser text,
  email text, phone text, street text, zip text, city text, country text, birth_date date, entry_date date, notes text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT i.id, i.created_at, i.first_name, i.last_name, i.level, i.specialization, i.status, i.real_time_status,
    i.languages, i.role, i.roles, i.instructor_type, i.gender, i.avatar_url, i.show_on_website, i.website_teaser,
    i.email, i.phone, i.street, i.zip, i.city, i.country, i.birth_date, i.entry_date, i.notes
  FROM public.instructors i WHERE p_id IS NULL OR i.id = p_id ORDER BY i.last_name, i.first_name;
END $$;

-- super_admin-only pay/bank/AHV
CREATE OR REPLACE FUNCTION public.instructors_pay_list(p_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, hourly_rate numeric, bank_name text, iban text, ahv_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT i.id, i.hourly_rate, i.bank_name, i.iban, i.ahv_number
  FROM public.instructors i WHERE p_id IS NULL OR i.id = p_id;
END $$;

-- Own profile (no notes, no pay)
CREATE OR REPLACE FUNCTION public.instructor_self()
RETURNS TABLE(id uuid, first_name text, last_name text, level text, specialization text, status text, real_time_status text,
  languages text[], role text, roles text[], gender text, avatar_url text,
  email text, phone text, street text, zip text, city text, country text, birth_date date, entry_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.first_name, i.last_name, i.level, i.specialization, i.status, i.real_time_status, i.languages, i.role, i.roles,
    i.gender, i.avatar_url, i.email, i.phone, i.street, i.zip, i.city, i.country, i.birth_date, i.entry_date
  FROM public.instructors i WHERE i.id = public.get_instructor_for_user(auth.uid())
$$;

-- Staff write (ops fields only); returns id
CREATE OR REPLACE FUNCTION public.instructor_ops_upsert(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.instructors; v_id uuid; k text;
  allowed text[] := ARRAY['id','first_name','last_name','level','specialization','status','real_time_status','languages','role','roles',
    'instructor_type','gender','avatar_url','show_on_website','website_teaser','email','phone','street','zip','city','country',
    'birth_date','entry_date','notes'];
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT k = ANY(allowed) THEN RAISE EXCEPTION 'forbidden_field: %', k USING ERRCODE = '42501'; END IF;
  END LOOP;
  r := jsonb_populate_record(NULL::public.instructors, p);
  IF p ? 'id' AND r.id IS NOT NULL THEN
    UPDATE public.instructors i SET
      first_name = CASE WHEN p ? 'first_name' THEN r.first_name ELSE i.first_name END,
      last_name = CASE WHEN p ? 'last_name' THEN r.last_name ELSE i.last_name END,
      level = CASE WHEN p ? 'level' THEN r.level ELSE i.level END,
      specialization = CASE WHEN p ? 'specialization' THEN r.specialization ELSE i.specialization END,
      status = CASE WHEN p ? 'status' THEN r.status ELSE i.status END,
      real_time_status = CASE WHEN p ? 'real_time_status' THEN r.real_time_status ELSE i.real_time_status END,
      languages = CASE WHEN p ? 'languages' THEN r.languages ELSE i.languages END,
      role = CASE WHEN p ? 'role' THEN r.role ELSE i.role END,
      roles = CASE WHEN p ? 'roles' THEN r.roles ELSE i.roles END,
      instructor_type = CASE WHEN p ? 'instructor_type' THEN r.instructor_type ELSE i.instructor_type END,
      gender = CASE WHEN p ? 'gender' THEN r.gender ELSE i.gender END,
      avatar_url = CASE WHEN p ? 'avatar_url' THEN r.avatar_url ELSE i.avatar_url END,
      show_on_website = CASE WHEN p ? 'show_on_website' THEN r.show_on_website ELSE i.show_on_website END,
      website_teaser = CASE WHEN p ? 'website_teaser' THEN r.website_teaser ELSE i.website_teaser END,
      email = CASE WHEN p ? 'email' THEN r.email ELSE i.email END,
      phone = CASE WHEN p ? 'phone' THEN r.phone ELSE i.phone END,
      street = CASE WHEN p ? 'street' THEN r.street ELSE i.street END,
      zip = CASE WHEN p ? 'zip' THEN r.zip ELSE i.zip END,
      city = CASE WHEN p ? 'city' THEN r.city ELSE i.city END,
      country = CASE WHEN p ? 'country' THEN r.country ELSE i.country END,
      birth_date = CASE WHEN p ? 'birth_date' THEN r.birth_date ELSE i.birth_date END,
      entry_date = CASE WHEN p ? 'entry_date' THEN r.entry_date ELSE i.entry_date END,
      notes = CASE WHEN p ? 'notes' THEN r.notes ELSE i.notes END
    WHERE i.id = r.id RETURNING i.id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  ELSE
    INSERT INTO public.instructors(first_name, last_name, level, specialization, status, real_time_status, languages, role, roles,
      instructor_type, gender, avatar_url, show_on_website, website_teaser, email, phone, street, zip, city, country, birth_date, entry_date, notes)
    VALUES (r.first_name, r.last_name, r.level, COALESCE(r.specialization,'ski'), COALESCE(r.status,'active'),
      COALESCE(r.real_time_status,'unavailable'), COALESCE(r.languages, ARRAY['de']), COALESCE(r.role,'instructor'), COALESCE(r.roles,'{}'),
      COALESCE(r.instructor_type,'teacher'), r.gender, r.avatar_url, false,
      COALESCE(r.website_teaser, 'Mit Freude, Geduld und Begeisterung begleite ich Kinder und Erwachsene auf ihrem Weg im Schnee – vom ersten Schwung bis zum nächsten persönlichen Erfolg.'),
      r.email, r.phone, r.street, r.zip, r.city, COALESCE(r.country,'LI'), r.birth_date, COALESCE(r.entry_date, CURRENT_DATE), r.notes)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.instructor_pay_update(p_id uuid, p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT k = ANY(ARRAY['hourly_rate','bank_name','iban','ahv_number']) THEN RAISE EXCEPTION 'forbidden_field: %', k; END IF;
  END LOOP;
  UPDATE public.instructors SET
    hourly_rate = CASE WHEN p ? 'hourly_rate' THEN NULLIF(p->>'hourly_rate','')::numeric ELSE hourly_rate END,
    bank_name = CASE WHEN p ? 'bank_name' THEN p->>'bank_name' ELSE bank_name END,
    iban = CASE WHEN p ? 'iban' THEN p->>'iban' ELSE iban END,
    ahv_number = CASE WHEN p ? 'ahv_number' THEN p->>'ahv_number' ELSE ahv_number END
  WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.instructor_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.instructors WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.instructor_self_update(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := public.get_instructor_for_user(auth.uid()); k text;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'no_linked_instructor' USING ERRCODE = '42501'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT k = ANY(ARRAY['phone','languages']) THEN RAISE EXCEPTION 'forbidden_field: %', k USING ERRCODE = '42501'; END IF;
  END LOOP;
  UPDATE public.instructors SET
    phone = CASE WHEN p ? 'phone' THEN p->>'phone' ELSE phone END,
    languages = CASE WHEN p ? 'languages' THEN ARRAY(SELECT jsonb_array_elements_text(p->'languages')) ELSE languages END
  WHERE id = v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.instructors_ops_list(uuid), public.instructors_pay_list(uuid), public.instructor_self(),
  public.instructor_ops_upsert(jsonb), public.instructor_pay_update(uuid, jsonb), public.instructor_delete(uuid),
  public.instructor_self_update(jsonb), public.instructors_sync_live_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructors_ops_list(uuid), public.instructors_pay_list(uuid), public.instructor_self(),
  public.instructor_ops_upsert(jsonb), public.instructor_pay_update(uuid, jsonb), public.instructor_delete(uuid),
  public.instructor_self_update(jsonb) TO authenticated, service_role;