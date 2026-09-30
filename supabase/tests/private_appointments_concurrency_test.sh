#!/usr/bin/env bash
# Two-session concurrency test for private appointment slot locking (Phase 2).
# Proves: two overlapping create requests for the same instructor+day, started at the
# same time from two separate DB sessions, produce exactly ONE booking and ONE conflict.
#
# Privileged integration test — needs a DB URL that may run service_role-only pa_* functions:
#   PRIVILEGED_DB_URL=postgres://... bash supabase/tests/private_appointments_concurrency_test.sh
# Writes synthetic rows (submission keys pa-conc-*) and ALWAYS deletes them at the end.
set -euo pipefail
: "${PRIVILEGED_DB_URL:?set PRIVILEGED_DB_URL}"
RUN="pa-conc-$(date +%s)"
PSQL=(psql "$PRIVILEGED_DB_URL" -X -q -t -A -v ON_ERROR_STOP=1)

session() { # $1 = A|B, $2 = start, $3 = end, $4 = hold seconds after create (keeps locks)
  "${PSQL[@]}" <<SQL
BEGIN;
SELECT public.pa_create_booking(jsonb_build_object(
  'submission_key','${RUN}-$1',
  'customer_id',(SELECT id FROM public.customers ORDER BY created_at LIMIT 1),
  'product_id',(SELECT id FROM public.products WHERE type='private' ORDER BY name LIMIT 1),
  'appointments', jsonb_build_array(jsonb_build_object('date', public.pa_business_today() + 421,
     'time_start','$2','time_end','$3','instructor_id',(SELECT id FROM public.instructors ORDER BY created_at LIMIT 1))),
  'participants', jsonb_build_array(jsonb_build_object('guest_key','${RUN}-g','first_name','PAConc','last_name','Test','birth_date','2014-01-01'))
), NULL)->>'ok';
SELECT pg_sleep($4);
COMMIT;
SQL
}

cleanup() {
  "${PSQL[@]}" <<SQL >/dev/null
DO \$\$ DECLARE v_t uuid[]; BEGIN
  SELECT array_agg(DISTINCT ticket_id) INTO v_t FROM public.private_appointments WHERE submission_key LIKE '${RUN}-%';
  DELETE FROM public.notification_queue WHERE (payload->>'ticket_id')::uuid = ANY(v_t);
  DELETE FROM public.ticket_history WHERE ticket_id = ANY(v_t);
  DELETE FROM public.ticket_items WHERE ticket_id = ANY(v_t);
  DELETE FROM public.private_appointment_participants WHERE appointment_id IN (SELECT id FROM public.private_appointments WHERE ticket_id = ANY(v_t));
  DELETE FROM public.private_appointments WHERE ticket_id = ANY(v_t);
  DELETE FROM public.private_appointment_submissions WHERE ticket_id = ANY(v_t);
  DELETE FROM public.tickets WHERE id = ANY(v_t);
  DELETE FROM public.customer_participants WHERE first_name='PAConc' AND last_name='Test' AND birth_date='2014-01-01';
END \$\$;
SQL
}
trap cleanup EXIT

# Both sessions hold their transaction open for 3 s after the create, so without the
# lock both would see the slot as free. With the lock, the second waits and then conflicts.
session A 10:00 12:00 3 > /tmp/${RUN}-A.out &
session B 11:00 13:00 3 > /tmp/${RUN}-B.out &
wait

RA=$(head -1 /tmp/${RUN}-A.out); RB=$(head -1 /tmp/${RUN}-B.out)
BOOKED=$("${PSQL[@]}" -c "SELECT count(*) FROM public.private_appointments WHERE submission_key LIKE '${RUN}-%'")
echo "session A ok=${RA:-<null>}  session B ok=${RB:-<null>}  appointments booked=${BOOKED}"
if [[ "$BOOKED" == "1" && ( ( "$RA" == "true" && "$RB" != "true" ) || ( "$RB" == "true" && "$RA" != "true" ) ) ]]; then
  echo "PA_CONCURRENCY_PASSED"
else
  echo "PA_CONCURRENCY_FAILED"; exit 1
fi
