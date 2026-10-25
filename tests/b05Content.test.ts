import { assertEquals,assert,assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { officeConfirmationVars } from "../supabase/functions/_shared/officeConfirmationContent.ts";
const people=[{id:"p",first_name:"Lea <img>",last_name:"S"},{id:"q",first_name:"Tom &",last_name:"S"}];
const items=[{id:"a",appointment_id:"ap",line_total:105,unit_price:85,item_type:"private",date:"2026-12-21",time_start:"10:00",time_end:"12:00",product:{name:"Privat"},internal_notes:"SECRET"},
 {id:"b",appointment_id:"bp",line_total:0,unit_price:105,item_type:"private",date:"2026-12-22",time_start:"14:00",time_end:"16:00",product:{name:"Privat"}},
 {id:"g",appointment_id:null,participant:people[0],line_total:320,item_type:"group",date:"2026-12-21",end_date:"2026-12-22",time_start:"10:00",time_end:"16:00",product:{name:"Group"},enrollments:["2026-12-21","2026-12-22"].flatMap(date=>[{instance:{date,start_time:"10:00",end_time:"12:00"}},{instance:{date,start_time:"14:00",end_time:"16:00"}}])}];
const tables:Record<string,unknown>={tickets:{ticket_number:"TEST",total_amount:425,customer:{last_name:"<Customer>"}},ticket_items:items,
 private_appointments:[{id:"ap",date:"2026-12-21",time_start:"10:00",time_end:"12:00",meeting_point:"Park"},{id:"bp",date:"2026-12-22",time_start:"14:00",time_end:"16:00",meeting_point:"Dorf"}],
 private_appointment_participants:[{appointment_id:"ap",participant_id:"p"},{appointment_id:"ap",participant_id:"q"},{appointment_id:"bp",participant_id:"p"},{appointment_id:"bp",participant_id:"q"}],customer_participants:people,ticket_item_overrides:[]};
function client(data=tables){return{from(name:string){const result={data:data[name],error:null};const chain:Record<string,unknown>={then:(resolve:(v:unknown)=>void)=>Promise.resolve(result).then(resolve)};for(const method of ["select","eq","neq","order","in","maybeSingle"])chain[method]=()=>chain;return chain;}};}
Deno.test("B05 complete two-person multiday separate AM/PM, stored zero, no internal notes",async()=>{
 const vars=await officeConfirmationVars(client(),"t");assert(vars.booking_time.includes("Lea <img> S, Tom & S"));assert(vars.booking_time.includes("21.12.2026 · 10:00–12:00, 14:00–16:00"));assert(vars.booking_time.includes("22.12.2026 · 10:00–12:00, 14:00–16:00"));assert(!vars.booking_time.includes("10:00–16:00"));assert(vars.booking_time.includes("CHF 0.00"));assert(vars.booking_time.includes("CHF 105.00"));assert(!JSON.stringify(vars).includes("SECRET"));assertEquals(vars.booking_total,"CHF 425.00");
});
Deno.test("B05 saved legacy single-day override and group participant",async()=>{
 const vars=await officeConfirmationVars(client({...tables,ticket_items:[{...items[2],end_date:null,enrollments:[],time_end:"12:00"}],ticket_item_overrides:[{ticket_item_id:"g",override_date:"2026-12-21",start_time:"09:00",end_time:"11:00"}]}),"t");assert(vars.booking_time.includes("Lea <img> S"));assert(vars.booking_time.includes("09:00–11:00"));
});
Deno.test("B05 missing canonical person or ambiguous legacy period fails closed",async()=>{
 await assertRejects(()=>officeConfirmationVars(client({...tables,customer_participants:[people[0]]}),"t"));
 await assertRejects(()=>officeConfirmationVars(client({...tables,ticket_items:[{...items[2],enrollments:[]}]}),"t"));
});
