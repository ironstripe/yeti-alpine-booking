import {assertEquals,assert} from 'jsr:@std/assert@1';
import {publicPrivateInformationSchema,publicPrivateProjection} from './publicPrivateTariffDisplay.ts';
const seed=Deno.readTextFileSync(new URL('../../pending/public_private_tariff_display_seed.sql',import.meta.url));
export const information=JSON.parse(seed.split('$information$')[1]);
Deno.test('typed source windows and supplements; rejects invalid, duplicate and generic double price',()=>{
 assert(publicPrivateInformationSchema.safeParse(information).success);
 assertEquals(information.windows.filter((w:{duration_minutes:number})=>w.duration_minutes===120).map((w:{amount_chf:number})=>w.amount_chf),[160,190,160,150,160,190]);
 for(const windows of [[{...information.windows[0],end:'09:30'}],[...information.windows,information.windows[0]],[{...information.windows[0],amount_chf:'75'}],[{...information.windows[0],window_kind:'within'}]])assertEquals(publicPrivateInformationSchema.safeParse({...information,windows}).success,false);
 assertEquals(information.windows.some((w:{amount_chf:number})=>w.amount_chf===170),false);
});
Deno.test('publication needs explicit verification; no provenance or operational price claims',()=>{
 assertEquals(publicPrivateProjection(null),null);
 assertEquals(publicPrivateProjection({...information,base_persons:1,verified_at:null,verified_by:null}),null);
 const result=publicPrivateProjection({...information,base_persons:1,verified_at:'2026-10-18T15:20:00Z',verified_by:'00000000-0000-4000-8000-000000000001'});assert(result);
 assertEquals(result.public_private_time_tariffs.version,1);assertEquals(result.public_private_time_tariffs.purpose,'display_information_only');
 assertEquals(result.public_private_tariff_rules.discount,{percent:10,threshold:4,unit:'lessons',scope:'same_participant_same_day'});
 assertEquals(result.public_private_tariff_rules.affects_operational_pricing,false);
 assertEquals('source_note' in result,false);assertEquals('verified_by' in result,false);
});
