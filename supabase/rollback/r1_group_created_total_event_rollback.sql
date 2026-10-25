-- Rollback for 0031_r1_group_created_total_event.sql: removes the R1 blocks from both function bodies.
-- History rows already written stay (they are true records of those bookings).
DO $rb$
DECLARE body text; s int; e int;
BEGIN
  body := pg_get_functiondef('public.bc_2627_staff_group_book(jsonb,uuid)'::regprocedure);
  s := strpos(body, '  -- R1: final booking value');
  IF s > 0 THEN
    e := strpos(substr(body, s), '  END IF;') + length('  END IF;') + 1;
    body := substr(body, 1, s - 1) || substr(body, s + e - 1);
    EXECUTE body;
  END IF;
  body := pg_get_functiondef('public.b07a_office_multi(jsonb,uuid,text)'::regprocedure);
  s := strpos(body, '    -- R1: group-only multi-item booking');
  IF s > 0 THEN
    e := strpos(substr(body, s), '    END IF;') + length('    END IF;') + 1;
    body := substr(body, 1, s - 1) || substr(body, s + e - 1);
    EXECUTE body;
  END IF;
END $rb$;
