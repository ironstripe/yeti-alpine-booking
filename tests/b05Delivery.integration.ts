// B04: actual legacy schema + ONLY pending B04 SQL, local PostgREST, fake transport.
// Never reads env database credentials. Refuses all non-local HTTP traffic.
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.5";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { attemptDelivery, ensureDelivery, payloadDigest, type Mail, type Transport } from "../supabase/functions/_shared/courseDelivery.ts";
import { attemptConfirmation, ensureConfirmationDelivery } from "../supabase/functions/_shared/bookingDelivery.ts";
import { createRetryHandler } from "../supabase/functions/retry-course-booking-delivery/handler.ts";
import { createConfirmationHandler } from "../supabase/functions/staff-booking-confirmation/handler.ts";
const admin = "postgres://postgres@127.0.0.1:55432/postgres";
const db = `b05_${Date.now()}`;
const url = admin.replace(/postgres$/, db);
const root = new URL("../", import.meta.url);
async function psql(target: string, args: string[]) {
 const out = await new Deno.Command("psql", {args:[target,"-q","-v","ON_ERROR_STOP=1",...args],env:{PGSSLMODE:"disable"},stdout:"piped",stderr:"piped"}).output();
 if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
}
const secret = "isolated-b04-local-jwt-0123456789abcdef";
async function jwt(role: string, sub?: string) {
 const enc=(x:unknown)=>btoa(JSON.stringify(x)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
 const body=`${enc({alg:"HS256",typ:"JWT"})}.${enc({role,sub,exp:Math.floor(Date.now()/1000)+3600})}`;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return body+"."+btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body))))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
await psql(admin,["-c",`CREATE DATABASE ${db}`]);
const sql=postgres(url,{ssl:false,onnotice:()=>{},max:8});
let rest: Deno.ChildProcess|undefined;
let pass=0, fail=0;
async function test(name:string,fn:()=>Promise<void>) {try {await fn();pass++;console.log("ok "+name);}catch(e){fail++;console.log("FAIL "+name+": "+String(e));}}
try {
 for (const file of ["tests/sql/baseline_prelude.sql","tests/sql/production_schema_baseline.sql"]) await psql(url,["-f",new URL(file,root).pathname]);
 await sql.unsafe(`INSERT INTO customers(id,email,last_name) VALUES ('00000000-0000-4000-8000-000000000002','synthetic@example.invalid','Test');
 INSERT INTO tickets(id,ticket_number,total_amount,customer_id) VALUES ('00000000-0000-4000-8000-000000000001','B04 synthetic',105,'00000000-0000-4000-8000-000000000002');
 INSERT INTO school_settings(name,email) VALUES ('Test','test@example.invalid');
 INSERT INTO email_templates(name,trigger,subject,body_html,is_active) VALUES ('Test','booking.confirmed','T {{ticket_number}}','<p>{{customer_last_name}}</p>',true);
 INSERT INTO booking_email_deliveries(ticket_id,kind,idempotency_key,recipient_email,status,attempts) SELECT '00000000-0000-4000-8000-000000000001','booking_confirmation','legacy','x@example.invalid','pending',0;`);
 const before=await sql`SELECT to_jsonb(d) AS row FROM booking_email_deliveries d`;
 const acl=await sql`SELECT relname,relacl::text,relrowsecurity FROM pg_class WHERE oid IN ('booking_email_deliveries'::regclass,'email_logs'::regclass) ORDER BY relname`;
 await test("actual baseline lacks lease/payload/protocol and rejects invoice",async()=>{
  assertEquals((await sql`SELECT column_name FROM information_schema.columns WHERE table_name='booking_email_deliveries' AND column_name IN ('claimed_at','frozen_payload','delivery_protocol')`).length,0);
  let rejected=false;try{await sql`UPDATE booking_email_deliveries SET kind='invoice'`;}catch{rejected=true;}assert(rejected);
 });
 await psql(url,["-f",new URL("supabase/pending/b04_delivery_compatibility.sql",root).pathname]);
 await test("only additive B04 SQL preserves existing row bytes, ACL/RLS and uniques",async()=>{
  const after=await sql`SELECT to_jsonb(d)-ARRAY['claimed_at','first_claimed_at','provider_idempotency_key','frozen_payload','payload_digest','delivery_protocol'] AS row FROM booking_email_deliveries d`;
  assertEquals(JSON.stringify(after),JSON.stringify(before));assertEquals(await sql`SELECT relname,relacl::text,relrowsecurity FROM pg_class WHERE oid IN ('booking_email_deliveries'::regclass,'email_logs'::regclass) ORDER BY relname`,acl);
  assertEquals((await sql`SELECT conname FROM pg_constraint WHERE conrelid='booking_email_deliveries'::regclass AND contype='u'`).length,2);
 });
 await sql.unsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF; END $$;
 GRANT anon,authenticated,service_role TO authenticator; ALTER ROLE service_role BYPASSRLS;
 GRANT USAGE ON SCHEMA public TO service_role,authenticated,anon;
 GRANT ALL ON booking_email_deliveries,email_logs,email_templates,tickets,school_settings,ticket_items,customers,ticket_history,products TO service_role;
 GRANT SELECT ON booking_email_deliveries,email_logs TO authenticated;`);
 const port=40000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
 rest=new Deno.Command("postgrest",{env:{PGRST_DB_URI:url.replace("postgres@","authenticator@"),PGRST_DB_SCHEMAS:"public",PGRST_DB_ANON_ROLE:"anon",PGRST_JWT_SECRET:secret,PGRST_SERVER_PORT:String(port),PGRST_SERVER_HOST:"127.0.0.1",PGRST_LOG_LEVEL:"crit",PGSSLMODE:"disable"},stdout:"null",stderr:"null"}).spawn();
 for(let i=0;i<100;i++){try{const r=await fetch(base);await r.body?.cancel();if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 const localFetch=async(input:RequestInfo|URL,init?:RequestInit)=>{const target=String(input).replace(`${base}/rest/v1`,base);if(!target.startsWith(base))throw new Error("Non-local request refused");return fetch(target,init);};
 const sb=createClient(base,await jwt("service_role"),{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});
 const ticket="00000000-0000-4000-8000-000000000001";
 let clock=Date.now(),calls:Mail[]=[],mode="ok";
 const transport:Transport=async(mail)=>{calls.push(structuredClone(mail));if(mode==="timeout")throw new Error("fake timeout");if(mode==="reject")return{ok:false,error:"fake 422",status:422};return{ok:true,id:`fake-${calls.length}`};};
 const attempt=(id:string,mode:"auto"|"manual"|"recover"="auto",force=false)=>attemptDelivery(sb,id,transport,{mode,force,now:()=>clock});
 const row=async(id:string)=>(await sql`SELECT * FROM booking_email_deliveries WHERE id=${id}`)[0];
 async function fresh(kind="booking_confirmation") {const [t]=await sql`INSERT INTO tickets(ticket_number,total_amount,customer_id) VALUES (${crypto.randomUUID()},105,'00000000-0000-4000-8000-000000000002') RETURNING id`;const d=await ensureDelivery(sb,t.id,kind as "invoice"|"booking_confirmation","x@example.invalid");assert(d);return d.id;}
 const financial=await sql`SELECT to_jsonb(t) row FROM tickets t WHERE id=${ticket}`;
 await test("legacy pending/sending/failed/sent unchanged and force cannot resend",async()=>{
  const [d]=await sql`SELECT id FROM booking_email_deliveries WHERE idempotency_key='legacy'`;
  for(const status of ["pending","sending","failed","sent"]){await sql`UPDATE booking_email_deliveries SET status=${status} WHERE id=${d.id}`;const old=await row(d.id);for(const m of ["auto","manual","recover"] as const){assertEquals((await attempt(d.id,m,true)).outcome,status==="sent"?"already_sent":"needs_review");}assertEquals(await row(d.id),old);}assertEquals(calls.length,0);
 });
 await test("invoice kind allowed; duplicates by key and ticket-kind rejected",async()=>{
  const id=await fresh("invoice"),d=await row(id);for(const p of [{ticket_id:d.ticket_id,kind:d.kind,idempotency_key:"different"},{ticket_id:ticket,kind:"invoice",idempotency_key:d.idempotency_key}]){const{error}=await sb.from("booking_email_deliveries").insert({...p,recipient_email:"x@example.invalid"});assert(error);}assertEquals((await attempt(id)).outcome,"failed");assertEquals(calls.length,0);
 });
 await test("real competing DB claims produce one transport handoff",async()=>{
  const id=await fresh();const n=calls.length;const r=await Promise.all([attempt(id),attempt(id)]);assertEquals(r.map(x=>x.outcome).sort(),["not_claimed","sent"]);assertEquals(calls.length,n+1);
 });
 await test("old sender refuses protocol and invoice rows; legacy manual is review",async()=>{
  const id=await fresh();assertEquals(await attemptConfirmation(sb,id),"not_claimed");const[d]=await sql`SELECT id FROM booking_email_deliveries WHERE idempotency_key='legacy'`;assertEquals(await attemptConfirmation(sb,d.id,{manual:true}),"needs_review");
 });
 await test("timeout within 24h reuses exact bytes/key despite changed template",async()=>{
  const id=await fresh();mode="timeout";const timed=await attempt(id);assertEquals(timed.code,"transport_unknown");mode="ok";const original=(await row(id)).frozen_payload.mail;await sql`UPDATE email_templates SET subject='changed'`;assertEquals((await attempt(id,"manual")).outcome,"sent");assertEquals(calls.at(-1),original);
 });
 await test("at 24h unknown remains review even force and repeated attempts",async()=>{
  const id=await fresh();mode="timeout";const timed=await attempt(id);assertEquals(timed.code,"transport_unknown");mode="ok";const old=await row(id);clock=new Date(old.first_claimed_at).getTime()+24*60*60*1000;const n=calls.length;for(let i=0;i<2;i++)assertEquals((await attempt(id,"manual",true)).outcome,"needs_review");assertEquals(calls.length,n);assertEquals(await row(id),old);clock=Date.now();
 });
 await test("digest corruption and missing frozen payload never rebuild",async()=>{
  for(const corrupt of ["digest","missing"]){const id=await fresh();mode="timeout";const timed=await attempt(id);assertEquals(timed.code,"transport_unknown");mode="ok";if(corrupt==="digest")await sql`UPDATE booking_email_deliveries SET frozen_payload=jsonb_set(frozen_payload,'{mail,to}','"changed@example.invalid"') WHERE id=${id}`;else await sql`UPDATE booking_email_deliveries SET frozen_payload=NULL WHERE id=${id}`;const n=calls.length;for(let i=0;i<2;i++)assertEquals((await attempt(id,"manual",true)).outcome,"needs_review");assertEquals(calls.length,n);}
 });
 await test("definite rejection is distinct and safely starts new key",async()=>{
  const id=await fresh();mode="reject";await attempt(id);mode="ok";const key=(await row(id)).provider_idempotency_key;assertEquals((await attempt(id,"manual")).outcome,"sent");assert(calls.at(-1)?.idempotencyKey!==key);
 });
 await test("missing template/sender never hand off",async()=>{
  await sql`UPDATE email_templates SET is_active=false`;const a=await fresh(),n=calls.length;assertEquals((await attempt(a)).code,"template_missing");await sql`UPDATE email_templates SET is_active=true`;await sql`UPDATE school_settings SET email=NULL`;const b=await fresh();assertEquals((await attempt(b)).code,"sender_not_configured");assertEquals(calls.length,n);await sql`UPDATE school_settings SET email='x@example.invalid'`;
 });
 await test("freeze/audit write error aborts before fake transport",async()=>{
  for(const table of ["booking_email_deliveries","email_logs"]){await sql.unsafe(`CREATE FUNCTION b04_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER b04_fail BEFORE ${table==="email_logs"?"INSERT":"UPDATE"} ON ${table} FOR EACH ROW ${table==="email_logs"?"":"WHEN (NEW.frozen_payload IS NOT NULL)"} EXECUTE FUNCTION b04_fail();`);const id=await fresh(),n=calls.length;try{assertEquals((await attempt(id)).outcome,"failed");assertEquals(calls.length,n);}finally{await sql.unsafe(`DROP TRIGGER b04_fail ON ${table}; DROP FUNCTION b04_fail()`);}}
 });
 await test("provider accepted + failed durable sent update reconciles log without resend",async()=>{
  const id=await fresh();await sql.unsafe(`CREATE FUNCTION b04_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic sent failure'; END $$; CREATE TRIGGER b04_fail BEFORE UPDATE ON booking_email_deliveries FOR EACH ROW WHEN (NEW.status='sent') EXECUTE FUNCTION b04_fail();`);try{assertEquals((await attempt(id)).code,"sent_state_unpersisted");}finally{await sql.unsafe(`DROP TRIGGER b04_fail ON booking_email_deliveries; DROP FUNCTION b04_fail()`);}await sql`UPDATE booking_email_deliveries SET provider_message_id=NULL WHERE id=${id}`;clock=Date.now()+11*60*1000;const n=calls.length;const recovery=await attempt(id,"recover");assertEquals(recovery.outcome,"reconciled_sent");assertEquals(calls.length,n);clock=Date.now();
 });
 await test("unauthorized handler does no work; no financial mutations",async()=>{
  const n=calls.length;const handler=createRetryHandler(sb,{transport,authorize:async()=>new Response("denied",{status:403})});const r=await handler(new Request("http://localhost/retry",{method:"POST",body:JSON.stringify({action:"recover_stuck"})}));assertEquals(r.status,403);assertEquals(calls.length,n);assertEquals(await sql`SELECT to_jsonb(t) row FROM tickets t WHERE id=${ticket}`,financial);
 });
 await test("row/evidence/claim read-write errors fail closed without transport",async()=>{
  for(const scenario of ["read","evidence","claim"]){const id=await fresh();if(scenario==="evidence"){mode="timeout";const timed=await attempt(id);assertEquals(timed.code,"transport_unknown");mode="ok";}const n=calls.length;
   const wrapped={from:(table:string)=>{const b=sb.from(table);if(scenario==="claim"&&table==="booking_email_deliveries"){b.update=()=>({eq(){return this;},select(){return this;},maybeSingle:async()=>({data:null,error:{message:"fake claim write"}})}) as any;}
   if((scenario==="read"&&table==="booking_email_deliveries")||(scenario==="evidence"&&table==="email_logs")){const original=b.select.bind(b);b.select=(...args:any[])=>{const q=original(...args);q.maybeSingle=async()=>({data:null,error:{message:"fake read"}});if(scenario==="evidence")q.then=(resolve:any)=>resolve({data:null,error:{message:"fake evidence read"}});return q;};}return b;}};
   assertEquals((await attemptDelivery(wrapped,id,transport,{mode:scenario==="evidence"?"manual":"auto",now:()=>clock})).outcome,"needs_review");assertEquals(calls.length,n);
  }
 });
 await test("RLS hides recipient/content from anonymous and teacher",async()=>{
  for(const role of ["anon","authenticated"]){const client=createClient(base,await jwt(role,"00000000-0000-4000-8000-000000000099"),{auth:{persistSession:false},global:{fetch:localFetch}});const r=await client.from("booking_email_deliveries").select("recipient_email,frozen_payload");assert(r.error || r.data?.length===0);const w=await client.from("booking_email_deliveries").update({status:"sent"}).eq("idempotency_key","legacy");assert(w.error || !w.data);}
 });
 await test("invoice frozen attachment bytes survive retry without invoice/document query",async()=>{
  const id=await fresh("invoice"),d=await row(id);const mail:Mail={from:"Test <x@example.invalid>",to:d.recipient_email,subject:"Frozen invoice",html:"<p>Unchanged</p>",idempotencyKey:d.idempotency_key,attachments:[{filename:"invoice.html",content:"ZnJvemVu",content_type:"text/html"}]};
  await sql`UPDATE booking_email_deliveries SET status='failed',attempts=1,claimed_at=${new Date(clock).toISOString()},first_claimed_at=${new Date(clock).toISOString()},provider_idempotency_key=${mail.idempotencyKey},frozen_payload=${sql.json({mail,template_id:null,invoice_id:null})},payload_digest=${await payloadDigest(mail)},last_error_code='transport_unknown' WHERE id=${id}`;
  assertEquals((await attempt(id,"manual")).outcome,"sent");assertEquals(calls.at(-1),mail);
 });
 await test("staged ensure collision never upgrades legacy or changes leased bytes",async()=>{
  const [old]=await sql`SELECT * FROM booking_email_deliveries WHERE idempotency_key='legacy'`;await sql`UPDATE booking_email_deliveries SET idempotency_key=${`ticket:${ticket}:booking_confirmation`},status='pending' WHERE id=${old.id}`;
  const original=await row(old.id);const d=await ensureDelivery(sb,ticket,"booking_confirmation","different@example.invalid");assert(d);assertEquals(await row(old.id),original);assertEquals((await attempt(old.id)).code,"legacy_delivery_review");assertEquals(await attemptConfirmation(sb,old.id),"needs_review");
  const id=await fresh(),leased=await row(id);await ensureConfirmationDelivery(sb,leased.ticket_id,"different@example.invalid");assertEquals(await row(id),leased);
 });
 await test("schema incompatible fails closed before insert/transport",async()=>{
  await sql`ALTER TABLE booking_email_deliveries RENAME COLUMN delivery_protocol TO hidden_protocol`;await sql`NOTIFY pgrst,'reload schema'`;await new Promise(r=>setTimeout(r,300));const n=calls.length;const[id]=await sql`SELECT id FROM booking_email_deliveries LIMIT 1`;assertEquals((await attempt(id.id)).code,"schema_incompatible");let rejected=false;try{await ensureDelivery(sb,ticket,"invoice","x@example.invalid");}catch{rejected=true;}assert(rejected);assertEquals(calls.length,n);
 }); await psql(url,["-f",new URL("supabase/pending/b05_office_confirmation_intent.sql",root).pathname]);
 await sql`ALTER TABLE booking_email_deliveries RENAME COLUMN hidden_protocol TO delivery_protocol`;await sql`NOTIFY pgrst,'reload schema'`;await new Promise(r=>setTimeout(r,300));
 await sql`INSERT INTO seasons(name,start_date,end_date) VALUES ('Synthetic','2026-12-01','2027-04-15')`;
 await sql`NOTIFY pgrst,'reload schema'`;await new Promise(r=>setTimeout(r,300));
 const staff=createConfirmationHandler(sb,{transport,authorize:async()=>({userId:"synthetic-office"}),now:()=>clock});
 const invoke=async(t:string,action:string,extra={})=>{const r=await staff(new Request("http://localhost/confirmation",{method:"POST",body:JSON.stringify({ticket_id:t,action,...extra})}));return{status:r.status,...await r.json()};};
 async function fixture(requested:boolean|null,email:string|null="saved@example.invalid",group=false){
  const [c]=await sql`INSERT INTO customers(email,last_name) VALUES (${email===null?null:crypto.randomUUID()+email},'Saved <Customer>') RETURNING id,email`;
  const [t]=await sql`INSERT INTO tickets(ticket_number,total_amount,customer_id) VALUES (${crypto.randomUUID()},105,${c.id}) RETURNING id`;
  if(requested!==null)await sql`INSERT INTO office_booking_confirmation_intents(ticket_id,requested,created_by) VALUES (${t.id},${requested},'00000000-0000-4000-8000-000000000099')`;
  const [prod]=await sql`INSERT INTO products(name,type,price,is_active,season_id) VALUES ('Lesson','private',105,true,(SELECT id FROM seasons LIMIT 1)) RETURNING id`;
  await sql`INSERT INTO ticket_items(ticket_id,product_id,date,time_start,time_end,unit_price,item_type,internal_notes,instructor_notes) VALUES (${t.id},${prod.id},'2026-12-21','10:00','12:00',105,${group?'group':'private'},'DO NOT EXPOSE','SECRET TEACHER')`;
  return{ticket:t.id,email:c.email};
 }
 await sql`GRANT ALL ON office_booking_confirmation_intents,private_appointments,private_appointment_participants,customer_participants,group_course_enrollments,group_course_instances TO service_role`;
 await test("B05 ON/OFF/NULL recipient authoritative; explicit later send only",async()=>{
  for(const group of [false,true])for(const choice of [true,false])for(const email of ["saved@example.invalid",null]){
   const f=await fixture(choice,email,group),n=calls.length;const result=await invoke(f.ticket,"process");
   assertEquals(result.outcome,email===null?"no_email":choice?"sent":"not_requested");assertEquals(calls.length,n+(email!==null&&choice?1:0));
   if(email!==null&&choice)assertEquals(calls.at(-1)?.to,f.email);
   if(email!==null&&!choice){assertEquals((await invoke(f.ticket,"send")).outcome,"sent");assertEquals(calls.at(-1)?.to,f.email);}
  }
 });
 await test("B05 failure after saved ticket remains saved; HTTP200 success false and manual retry",async()=>{
  const f=await fixture(true);mode="reject";const n=calls.length;const r=await invoke(f.ticket,"process");assertEquals(r.status,200);assertEquals(r.success,false);assertEquals(r.outcome,"failed");assertEquals((await sql`SELECT id FROM tickets WHERE id=${f.ticket}`).length,1);
  mode="ok";assertEquals((await invoke(f.ticket,"send")).outcome,"sent");assertEquals((await invoke(f.ticket,"send")).outcome,"already_sent");assertEquals(calls.length,n+2);
 });
 await test("B05 concurrent first-send one handoff and legacy intent never auto-backfilled",async()=>{
  const f=await fixture(true);const n=calls.length;await Promise.all([invoke(f.ticket,"process"),invoke(f.ticket,"process")]);assertEquals(calls.length,n+1);
  const old=await fixture(null);assertEquals((await invoke(old.ticket,"process")).outcome,"not_requested");assertEquals((await invoke(old.ticket,"send")).outcome,"sent");
 });
 await test("B05 denies force/recipient/payload, anon/teacher and unavailable intent schema",async()=>{
  const f=await fixture(true),n=calls.length;assertEquals((await invoke(f.ticket,"send",{force:true})).status,400);assertEquals((await invoke(f.ticket,"send",{recipient_email:"evil@example.invalid"})).status,400);
  for(const status of [401,403]){const denied=createConfirmationHandler(sb,{transport,authorize:async()=>new Response("denied",{status})});assertEquals((await denied(new Request("http://localhost/c",{method:"POST",body:JSON.stringify({ticket_id:f.ticket,action:"send"})}))).status,status);}
  await sql`ALTER TABLE office_booking_confirmation_intents RENAME TO b05_missing`;await sql`NOTIFY pgrst,'reload schema'`;await new Promise(r=>setTimeout(r,300));
  assertEquals((await invoke(f.ticket,"send")).outcome,"unavailable");assertEquals(calls.length,n);await sql`ALTER TABLE b05_missing RENAME TO office_booking_confirmation_intents`;await sql`NOTIFY pgrst,'reload schema'`;await new Promise(r=>setTimeout(r,300));
 });
 await test("B05 unknown/expired/digest mismatch obey existing B04 guards",async()=>{
  for(const corrupt of [false,true]){const f=await fixture(true);mode="timeout";assertEquals((await invoke(f.ticket,"process")).code,"transport_unknown");mode="ok";
   const[d]=await sql`SELECT * FROM booking_email_deliveries WHERE ticket_id=${f.ticket}`;const n=calls.length;
   if(corrupt)await sql`UPDATE booking_email_deliveries SET payload_digest='bad' WHERE id=${d.id}`;else clock=new Date(d.first_claimed_at).getTime()+24*60*60*1000;
   assertEquals((await invoke(f.ticket,"send")).outcome,"needs_review");assertEquals(calls.length,n);clock=Date.now();}
 });

} finally {console.log(`${pass} passed / ${fail} failed`);try{rest?.kill("SIGTERM");await rest?.status;}catch{}await sql.end();await psql(admin,["-c",`DROP DATABASE ${db} WITH (FORCE)`]);}
if(fail)Deno.exit(1);
