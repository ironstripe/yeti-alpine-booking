import { supabase } from "@/integrations/supabase/client";
export interface ConfirmationResult { success: boolean; outcome: string; code?: string | null }
export const confirmationLabel = (r?: ConfirmationResult | null): string => {
 const labels: Record<string,string>={sent:"Bestätigung gesendet",already_sent:"Bestätigung bereits gesendet",reconciled_sent:"Bestätigung gesendet",
 not_requested:"Bestätigung nicht angefordert",no_email:"Keine E-Mail-Adresse vorhanden",pending:"Bestätigung ausstehend",
 sending:"Bestätigung wird verarbeitet",in_progress:"Bestätigung wird verarbeitet",failed:"Bestätigungsversand fehlgeschlagen",
 unknown:"Versandergebnis unbekannt – bitte prüfen",needs_review:"Bestätigungsversand erfordert Prüfung",not_claimed:"Bestätigung wird verarbeitet – bitte Status prüfen",
 unavailable:"Bestätigungsversand nicht verfügbar – Buchung bleibt gespeichert"};
 return labels[r?.outcome??"pending"]??"Versandstatus unklar – bitte prüfen";
};
/** Server owns the saved recipient, content, frozen bytes and claims. */
export async function bookingConfirmation(ticketId:string,action:"status"|"process"|"send"):Promise<ConfirmationResult>{
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  const result=await Promise.race([supabase.functions.invoke("staff-booking-confirmation",{body:{ticket_id:ticketId,action}}),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("timeout")),12000);})]);
  if(result.error) return {success:false,outcome:"unavailable"};
  const data=result.data;
  if(!data||typeof data.outcome!=="string"||typeof data.success!=="boolean") return {success:false,outcome:"unknown"};
  if(["sent","already_sent","reconciled_sent"].includes(data.outcome)&&data.success!==true) return {success:false,outcome:"unknown"};
  return data;
 }catch{return {success:false,outcome:"unknown"};}finally{if(timer)clearTimeout(timer);}
}
