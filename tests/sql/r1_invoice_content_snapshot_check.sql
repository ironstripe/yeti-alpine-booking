-- R1: run after r1_invoice_content_snapshot.sql on a local test DB (psql -v ON_ERROR_STOP=1 -1). Fails on any accepted malformed value.
INSERT INTO customers(id,last_name,email) VALUES ('00000000-0000-4000-8000-0000000000c9','Synth','s9@example.invalid');
INSERT INTO tickets(id,ticket_number,customer_id,status,total_amount) VALUES ('00000000-0000-4000-8000-0000000000d9','T-R1c','00000000-0000-4000-8000-0000000000c9','confirmed',1);
DO $$ DECLARE v text; BEGIN
 FOREACH v IN ARRAY ARRAY['{}','{"version":1}','{"lines":[]}','{"version":"1","lines":[]}','{"version":1,"lines":{}}','[]','"x"','{"version":2,"lines":[]}'] LOOP
  BEGIN
   INSERT INTO invoices(ticket_id,invoice_number,status,subtotal,total,qr_reference,due_date,content_snapshot)
   VALUES ('00000000-0000-4000-8000-0000000000d9','R-C-'||md5(v),'draft',1,1,'','2026-12-31',v::jsonb);
   RAISE EXCEPTION 'accepted malformed %', v;
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
END $$;
INSERT INTO invoices(ticket_id,invoice_number,status,subtotal,total,qr_reference,due_date,content_snapshot)
VALUES ('00000000-0000-4000-8000-0000000000d9','R-C-ok','draft',1,1,'','2026-12-31','{"version":1,"lines":[]}');
ROLLBACK;
