import { test, expect } from 'bun:test';
import { saturdaySelectionError, checkSaturdaySelection, type SaturdayFacts } from '../supabase/functions/_shared/saturdaySelection';
import { seriesSelection, type ProductOffering } from '../src/lib/productPublicOffering';
const first = ['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06'];
const second = ['2027-02-20','2027-02-27','2027-03-06','2027-03-13','2027-03-20'];
const facts = (level: string): SaturdayFacts => ({course_type:'saturday_course',skill_level_id:level,product_type:level==='ski_windel_wedel'?'group_toddler':'group',saturday_product:true,periods:[first,second]});
const error = (level: string, dates: string[]) => saturdaySelectionError(facts(level),dates);
for (const level of ['ski_windel_wedel','ski_snow_kids','ski_blauer_prinz']) {
  test(`${level}: first date mandatory in both series`, () => {
    for (const dates of [first,second]) {
      expect(error(level,[dates[1]])).not.toBeNull();
      expect(error(level,[dates[0]])).toBeNull();
      expect(error(level,[dates[4],dates[0]])).toBeNull();
    }
  });
}
test('Windel permits any 1–3 selected dates with first; no arbitrary calendar removal', () => {
  for(let mask=1;mask<32;mask++) {
    const dates=first.filter((_,i)=>mask & (1<<i));
    expect(error('ski_windel_wedel',dates)===null).toBe(dates.length<=3 && dates.includes(first[0]));
  }
});
test('Windel rejects four even when fourth tier exists', () => expect(error('ski_windel_wedel',first.slice(0,4))).not.toBeNull());
for (const level of ['ski_blauer_koenig','ski_blauer_star','ski_roter_prinz','ski_academy','sb_youth_beginner','sb_youth_advanced']) {
  test(`${level}: free choice 1–5 without mandatory first`, () => {
    for(let mask=1;mask<32;mask++) expect(error(level,first.filter((_,i)=>mask & (1<<i)))).toBeNull();
  });
}
test('beginner free choice after first up to five dates',()=> {
  for(const level of ['ski_snow_kids','ski_blauer_prinz']) {
    expect(error(level,first)).toBeNull(); expect(error(level,[first[0],first[3],first[4]])).toBeNull();
  }
});
test('mixing series, duplicates, empty and non-offered dates rejected',()=> {
  for(const dates of [[first[0],second[0]],[first[0],first[0]],[],['2027-01-10'],['2027-01-02'],[...first,second[0]]]) expect(error('ski_blauer_star',dates)).not.toBeNull();
});
test('never mixes Saturday and weekday products/courses',()=> {
  expect(saturdaySelectionError({...facts('ski_blauer_star'),saturday_product:false},[first[0]])).not.toBeNull();
  expect(saturdaySelectionError({...facts('ski_blauer_star'),course_type:'weekly'},[first[0]])).not.toBeNull();
  expect(saturdaySelectionError({...facts('ski_blauer_prinz'),course_type:'weekly',saturday_product:false},['2026-12-23'])).toBeNull();
});
test('exact Windel tiers 70/110/140 charged once despite five offered dates',()=> {
  const offering:ProductOffering={schedule_kind:'weekly',weekdays:[6],dates:[],time_blocks:[{start:'10:00',end:'12:00'}],series:[{sequence:1,start_date:first[0],end_date:first[4],max_selected_days:3}]};
  const tiers=[70,110,140].map((price,index)=>({day_count:index+1,cumulative_price:price}));
  for(const count of [1,2,3]) {
    const dates=[first[0],...first.slice(3)].slice(0,count);
    expect(error('ski_windel_wedel',dates)).toBeNull();
    expect(seriesSelection(offering,1,dates,tiers).price).toBe([70,110,140][count-1]);
  }
  expect(seriesSelection(offering,1,first.slice(0,4),tiers).price).toBeNull();
});
test('unavailable server facts fail closed',async()=> {
  const query={select:()=>query,eq:()=>query,maybeSingle:()=>Promise.resolve({error:{message:'unavailable'}}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({error:{message:'unavailable'}}).then(resolve)};
  await expect(checkSaturdaySelection({from:()=>query},'course','product',first)).rejects.toThrow('unavailable');
});