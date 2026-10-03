// Synthetic 26/27 fixture shared by the SQL and API integration tests. No production data.
export const S = '00000000-0000-4000-8000-000000000001';
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const K4 = id(0xa4), K2 = id(0xa2), E4 = id(0xe4), CARV = id(0xc2), INACTIVE = id(0xff), SAT = id(0xb2);
export const PRIV = id(0xd1), PRIVSB = id(0xd2);
export const C1 = id(0xc1), C3 = id(0xc3), C5 = id(0xc5), C6 = id(0xc6);
export const I1 = id(0xf001), I2 = id(0xf002), I3 = id(0xf003), I4 = id(0xf004);
export const BK = 'weekday:2027-01-04:BK', AG = 'weekday:2027-01-04:AG', SA = 'saturday_series:2027-01-09:BK', OFF = 'weekday:2027-01-04:OFF';
export const W4 = ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07'];

export const fixtureSql = `
  INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
  INSERT INTO skill_levels(id,name,discipline,target_group,sort_order) VALUES ('ski_blauer_koenig','BK','ski','child',1),('ski_adult_green','AG','ski','adult',2);
  INSERT INTO products(id,name,type,duration_minutes,price,season_id,discipline,is_active,show_on_website,min_age,max_age,pricing_type) VALUES
   ('${K4}','Kinder 4h','group',240,0,'${S}','ski',true,true,4,16,'tiered'),
   ('${K2}','Kinder 2h','group',120,0,'${S}','ski',true,true,4,16,'tiered'),
   ('${E4}','Erwachsene 4h','group',240,0,'${S}','ski',true,true,17,99,'tiered'),
   ('${CARV}','Carving 2h','group',120,0,'${S}','ski',true,true,17,99,'tiered'),
   ('${INACTIVE}','Kinder 4h alt','group',240,0,'${S}','ski',false,true,4,16,'tiered'),
   ('${SAT}','Samstag 2h','group',120,0,'${S}','ski',true,true,4,16,'tiered'),
   ('${PRIV}','Privat Ski','private',60,0,'${S}','ski',true,true,null,null,'fixed'),
   ('${PRIVSB}','Privat Snowboard','private',60,0,'${S}','snowboard',true,true,null,null,'fixed');
  INSERT INTO product_price_tiers(product_id,day_count,cumulative_price)
   SELECT '${K4}'::uuid,d,100*d FROM generate_series(1,5) d
   UNION ALL SELECT '${K2}'::uuid,1,60
   UNION ALL SELECT '${E4}'::uuid,d,120*d FROM generate_series(1,5) d
   UNION ALL SELECT '${CARV}'::uuid,1,99
   UNION ALL SELECT '${SAT}'::uuid,4,240 UNION ALL SELECT '${SAT}'::uuid,5,290;
  INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
   SELECT 'k4-'||d,'${S}'::uuid,'${K4}'::uuid,'sha','Gruppe','draft',d,240,1,(100*d)::numeric,'{"group_capacity":2}'::jsonb FROM generate_series(1,5) d
   UNION ALL SELECT 'k2-1','${S}','${K2}','sha','Gruppe','draft',1,120,1,60,'{"group_capacity":2}'
   UNION ALL SELECT 'e4-'||d,'${S}','${E4}','sha','Gruppe','draft',d,240,1,120*d,'{"group_capacity":2}' FROM generate_series(1,5) d
   UNION ALL SELECT 'c2-1','${S}','${CARV}','sha','Carving','draft',1,120,1,99,'{}'
   UNION ALL SELECT 'sa-'||d,'${S}','${SAT}','sha','Samstagkurs','draft',d,120,1,CASE d WHEN 4 THEN 240 ELSE 290 END,'{"group_capacity":2}' FROM generate_series(4,5) d
   UNION ALL SELECT 'p1-'||n,'${S}','${PRIV}','sha','Privat','draft',1,60,n,70+20*n,'{}' FROM generate_series(1,3) n
   UNION ALL SELECT 'ps-'||n,'${S}','${PRIVSB}','sha','Privat','draft',1,60,n,70+20*n,'{}' FROM generate_series(1,3) n;
  -- I1 ski role; I2 ski via capability only; I3 ski but deployed only in Feb; I4 office only.
  INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES
   ('${I1}','A','Eins','active','{ski}'),('${I2}','B','Zwei','active','{}'),
   ('${I3}','C','Drei','active','{ski}'),('${I4}','D','Vier','active','{office}');
  INSERT INTO capabilities(id,name,category) VALUES ('${id(0xcab)}','Ski Erwachsene Anfänger','Ski');
  INSERT INTO instructor_capabilities(instructor_id,capability_id) VALUES ('${I2}','${id(0xcab)}');
  INSERT INTO instructor_deployment_windows(instructor_id,valid_from,valid_until,source) VALUES ('${I3}','2027-02-01','2027-02-28','manual');
  INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('08:00','17:00',80);
  INSERT INTO group_courses(id,name,discipline,min_age,max_age,max_participants,price_per_day,is_active,course_type,skill_level_id,product_id) VALUES
   ('${C1}','26/27 Ski BK','ski',4,16,2,0,true,'weekly','ski_blauer_koenig','${K4}'),
   ('${C3}','26/27 Ski Erwachsene','ski',17,99,2,0,true,'weekly','ski_adult_green','${E4}'),
   ('${C5}','26/27 Samstag Ski BK','ski',4,16,2,0,true,'saturday_course','ski_blauer_koenig','${SAT}'),
   ('${C6}','26/27 Ski BK (inaktiv)','ski',4,16,2,0,false,'weekly','ski_blauer_koenig','${K4}');
  INSERT INTO training_groups(id,course_id,week_start,group_number,status) VALUES
   ('${id(0xb1)}','${C1}','2027-01-04',1,'active'),('${id(0xb3)}','${C3}','2027-01-04',1,'active'),
   ('${id(0xb5)}','${C5}','2027-01-04',1,'active'),('${id(0xb6)}','${C6}','2027-01-04',1,'active');
  INSERT INTO bc_2627_course_period_sources(source_key,course_id,training_group_id,source_sha256,tariff_source_ids,teaching_dates,eligible_variants) VALUES
   ('${BK}','${C1}','${id(0xb1)}','sha',ARRAY['k4-1'],ARRAY['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08']::date[],
     '{"${K4}":[1,2,3,4,5],"${K2}":[1,2,3],"${INACTIVE}":[1]}'),
   ('${AG}','${C3}','${id(0xb3)}','sha',ARRAY['e4-1'],ARRAY['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08']::date[],
     '{"${E4}":[1,2,3,4,5],"${CARV}":[1]}'),
   ('${SA}','${C5}','${id(0xb5)}','sha',ARRAY['sa-5'],ARRAY['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06']::date[],'{"${SAT}":[4,5]}'),
   ('${OFF}','${C6}','${id(0xb6)}','sha',ARRAY['k4-1'],ARRAY['2027-01-04','2027-01-05']::date[],'{"${K4}":[1,2]}');
  INSERT INTO bc_2627_course_product_variants VALUES
   ('${C1}','${K4}','{1,2,3,4,5}'),('${C1}','${K2}','{1,2,3}'),('${C1}','${INACTIVE}','{1}'),
   ('${C3}','${E4}','{1,2,3,4,5}'),('${C3}','${CARV}','{1}'),('${C5}','${SAT}','{4,5}'),('${C6}','${K4}','{1,2}');
  INSERT INTO group_course_instances(id,course_id,date,start_time,end_time)
   SELECT bc_2627_instance_id(ps.source_key,d,b), ps.course_id, d, split_part(b,'-',1)::time, split_part(b,'-',2)::time
     FROM bc_2627_course_period_sources ps, unnest(ps.teaching_dates) d,
          unnest(CASE WHEN ps.source_key LIKE 'saturday%' THEN ARRAY['10:00-12:00'] ELSE ARRAY['10:00-12:00','14:00-16:00'] END) b;
  -- 2027-01-08 afternoon BK instance has drifted real times (14:30): must not count as the 14-16 block.
  UPDATE group_course_instances SET start_time='14:30' WHERE id=bc_2627_instance_id('${BK}','2027-01-08','14:00-16:00');
  INSERT INTO training_course_dates(training_id,date,is_cancelled)
   SELECT '${C5}',d,d='2027-01-30' FROM unnest(ARRAY['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06']::date[]) d;
  `;
