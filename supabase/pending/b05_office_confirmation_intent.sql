-- B05 pending/uninstalled. No sends, triggers, backfill or financial changes.
CREATE TABLE public.office_booking_confirmation_intents (
 ticket_id uuid PRIMARY KEY REFERENCES public.tickets(id), requested boolean NOT NULL,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.office_booking_confirmation_intents TO service_role;
REVOKE ALL ON public.office_booking_confirmation_intents FROM PUBLIC, anon, authenticated;
ALTER TABLE public.office_booking_confirmation_intents ENABLE ROW LEVEL SECURITY;
-- No browser policies: service-only after staff authorization.
CREATE FUNCTION public.b05_office_create(p jsonb, p_actor uuid, p_kind text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r jsonb; v_requested boolean;
BEGIN
 IF p_kind NOT IN ('private','group') OR p_actor IS NULL OR jsonb_typeof(p->'confirmation_requested') IS DISTINCT FROM 'boolean' THEN
  RETURN jsonb_build_object('error','invalid','field','confirmation_requested');
 END IF;
 -- Required B04 contract must be available before any canonical write.
 PERFORM claimed_at,first_claimed_at,provider_idempotency_key,frozen_payload,payload_digest,delivery_protocol FROM public.booking_email_deliveries LIMIT 0;
 v_requested := (p->>'confirmation_requested')::boolean;
 IF p_kind='private' THEN r:=public.pa_create_booking_finalized(p-'confirmation_requested',p_actor);
 ELSE r:=public.bc_2627_staff_group_book(p-'confirmation_requested',p_actor); END IF;
 IF r->>'ok'='true' THEN
  IF coalesce((r->>'replayed')::boolean,false)=false THEN
   INSERT INTO public.office_booking_confirmation_intents(ticket_id,requested,created_by)
    VALUES ((r->>'ticket_id')::uuid,v_requested,p_actor);
  END IF;
  -- Replay never backfills historic intent or changes the first explicit choice.
  SELECT requested INTO v_requested FROM public.office_booking_confirmation_intents WHERE ticket_id=(r->>'ticket_id')::uuid;
  r:=r||jsonb_build_object('confirmation_requested',v_requested);
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.b05_office_create(jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.b05_office_create(jsonb,uuid,text) TO service_role;
