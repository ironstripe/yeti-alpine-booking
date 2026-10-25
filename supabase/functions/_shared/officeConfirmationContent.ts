import { projectBookingLines, type ProjectionLine } from "./bookingReadProjection.ts";
// deno-lint-ignore no-explicit-any
type Client = any;
const dateLabel=(d:string)=>d.slice(0,10).split("-").reverse().join(".");
const timeLabel=(a:string,b:string)=>`${a.slice(0,5)}–${b.slice(0,5)}`;
/** Complete saved lessons only. No invoice generation, notes, client HTML or pricing. */
export async function officeConfirmationVars(sb:Client,ticketId:string):Promise<Record<string,string>>{
 const {data:ticket,error:te}=await sb.from("tickets").select("ticket_number,total_amount,customer:customers(last_name)").eq("id",ticketId).maybeSingle();
 const {data:items,error:ie}=await sb.from("ticket_items")
  .select("id,appointment_id,participant:customer_participants(id,first_name,last_name),date,end_date,time_start,time_end,meeting_point,line_total,unit_price,item_type,product:products(name),enrollments:group_course_enrollments(instance:group_course_instances(date,start_time,end_time))")
  .eq("ticket_id",ticketId).neq("status","cancelled").order("date").order("time_start");
 if(te||ie||!ticket||!items?.length) throw new Error("confirmation_content_read_failed");
 const ids=[...new Set(items.map((l:ProjectionLine)=>l.appointment_id).filter(Boolean))];
 const [appointments,links]=ids.length?await Promise.all([
  sb.from("private_appointments").select("id,date,time_start,time_end,instructor_id,meeting_point").eq("ticket_id",ticketId).in("id",ids),
  sb.from("private_appointment_participants").select("appointment_id,participant_id").in("appointment_id",ids),
 ]):[{data:[],error:null},{data:[],error:null}];
 if(appointments.error||links.error) throw new Error("confirmation_content_read_failed");
 const personIds=[...new Set(links.data.map((l:{participant_id:string})=>l.participant_id))];
 const people=personIds.length?await sb.from("customer_participants").select("id,first_name,last_name").in("id",personIds):{data:[],error:null};
 if(people.error) throw new Error("confirmation_content_read_failed");
 const projection=projectBookingLines(items,appointments.data,links.data,people.data,[]);
 const descriptions:string[]=[],dates=new Set<string>(),points=new Set<string>(),products=new Set<string>(),names=new Set<string>();
 for(const item of items){
  const projected=projection[item.id];
  if(projected.problem || (item.appointment_id&&!projected.people.length)) throw new Error("confirmation_canonical_data_missing");
  const lesson=projected.appointment??item;
  const participantNames=projected.people.map(p=>p.name).join(", ");
  for(const p of projected.people) names.add(p.name);
  const product=item.product?.name??"";products.add(product);
  const point=lesson.meeting_point??"";if(point)points.add(point);
  const blocks=(item.enrollments??[]).map((e:{instance?:{date:string;start_time:string;end_time:string}})=>e.instance).filter(Boolean);
  if(item.item_type==="group"&&item.end_date&&item.end_date!==item.date&&!blocks.length) throw new Error("confirmation_group_schedule_missing");
  const schedule=blocks.length?blocks.map((b:{date:string;start_time:string;end_time:string})=>({date:b.date,start:b.start_time,end:b.end_time})):
   [{date:lesson.date,start:lesson.time_start,end:lesson.time_end}];
  const byDay=new Map<string,Set<string>>();
  for(const b of schedule){
   if(!b.date||!b.start||!b.end)throw new Error("confirmation_schedule_missing");
   dates.add(b.date);const times=byDay.get(b.date)??new Set<string>();times.add(timeLabel(b.start,b.end));byDay.set(b.date,times);
  }
  const when=[...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([day,times])=>`${dateLabel(day)} · ${[...times].sort().join(", ")}`).join("; ");
  const amount=Number(projected.amount);if(!Number.isFinite(amount))throw new Error("confirmation_amount_invalid");
  descriptions.push([participantNames,product,when,point,`CHF ${amount.toFixed(2)}`].filter(Boolean).join(" · "));
 }
 // Existing template placeholders retained; booking_time carries correlated full entries,
 // so active old templates also include every person/date/separate block, not first row only.
 return {ticket_number:ticket.ticket_number??"",customer_salutation:"",customer_last_name:ticket.customer?.last_name??"",
  product_name:[...products].join(", "),booking_date:[...dates].sort().map(dateLabel).join(", "),
  booking_time:descriptions.join("\n"),meeting_point:[...points].join(", "),
  participant_names:[...names].join(", "),booking_details:descriptions.join("\n"),booking_total:`CHF ${Number(ticket.total_amount).toFixed(2)}`};
}
