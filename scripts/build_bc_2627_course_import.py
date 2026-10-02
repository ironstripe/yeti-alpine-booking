#!/usr/bin/env python3
"""Generate a reviewed, fail-closed SQL import from the checked 26/27 course manifest.

No connection, credentials or Cloud writes. Output is a SQL artifact for separate
synthetic PostgreSQL validation and explicit, single-run live application.
"""
import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

SOURCE_SHA = 'b5db33ab54a9c9565edd6541461a3b982afc4a5f78ded6bbd833e99ee3f14d67'


def uuid(key):
    h=hashlib.md5(('malbun-2627:'+key).encode()).hexdigest()
    return f'{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}'


def main():
    if len(sys.argv)!=3:
        raise SystemExit('usage: build_bc_2627_course_import.py manifest.csv import.sql')
    manifest,output=map(Path,sys.argv[1:])
    with manifest.open(newline='',encoding='utf-8') as f:rows=list(csv.DictReader(f))
    if len(rows)!=370 or Counter(r['audience_policy'] for r in rows)!={'YOUTH_GROUP_UP_TO_16':306,'ADULT_GROUP_EXCEPTION':64}:
        raise ValueError('Missing / changed source course periods')
    data=[];keys=set();templates=defaultdict(list);lesson_count=0
    for r in rows:
        if r['source_snapshot_sha256']!=SOURCE_SHA or r['status']!='PREPARED_NOT_ACTIVE' or r['instructor_id'] or r['lunch_included']!='false':
            raise ValueError('Source, safety or lunch drift')
        key=r['period_type']+':'+r['period_start']+':'+r['booking_activity_label']
        template_key=r['period_type']+':'+r['booking_activity_label']
        if key in keys:raise ValueError('Duplicate source key')
        keys.add(key);templates[template_key].append(r)
        variants=json.loads(r['variant_day_counts'])
        if set(variants)!=set(r['eligible_product_ids'].split('|')) or r['primary_product_id'] not in variants:
            raise ValueError(f'Variant drift {key}')
        dates=r['teaching_dates'].split('|')
        blocks=r['schedule_time_blocks'].split('|')
        if len(blocks) not in (1,2) or any('-' not in x for x in blocks) or len(dates)!=len(set(dates)):
            raise ValueError(f'Lesson shape drift {key}')
        lesson_count+=len(dates)*len(blocks)
        data.append({
            'key':key,'template_key':template_key,
            'course_id':uuid('template:'+template_key),'group_id':uuid('group:'+key),
            'period_type':r['period_type'],'label':r['booking_activity_label'],
            'week_start':r['week_start'],'period_start':r['period_start'],'period_end':r['period_end'],
            'level':r['skill_level_id'].removeprefix('NEW:'),
            'primary_product':r['primary_product_id'],'variants':variants,
            'capacity':int(r['capacity_max']),'age_min':int(r['age_min']),'age_max':int(r['age_max']),
            'dates':dates,'blocks':blocks,'source_tariff_ids':r['source_tariff_ids'].split('|'),
            'source_sha':SOURCE_SHA,
        })
    if len(templates)!=32 or lesson_count!=3210:
        raise ValueError('Template or lesson cardinality drift')
    for template_key,group in templates.items():
        stable=('level','primary_product','variants','capacity','age_min','age_max','blocks')
        seed=next(x for x in data if x['template_key']==template_key)
        if any(any(x[k]!=seed[k] for k in stable) for x in data if x['template_key']==template_key):
            raise ValueError('Template varies over weeks: '+template_key)
    raw=json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':'))
    if '$bc_course_payload$' in raw:raise ValueError('Unsafe dollar quote')
    header='''-- Exact Booking-Corner 26/27 course plan: 32 inactive YETI templates,
-- 370 weekly/series groups, 1816 teaching dates, 3210 two-hour instances.
-- Single transaction. Fail closed on source drift/target collision.
-- Source: data/bc-2627/course-manifest-not-active.csv (owner age decision).
-- Checkout, product activation, instructor assignments and invoices are untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.bc_2627_course_period_sources (
  source_key text PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.group_courses(id),
  training_group_id uuid NOT NULL REFERENCES public.training_groups(id),
  source_sha256 text NOT NULL,
  tariff_source_ids text[] NOT NULL,
  teaching_dates date[] NOT NULL,
  eligible_variants jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bc_2627_course_product_variants (
  course_id uuid NOT NULL REFERENCES public.group_courses(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  eligible_day_counts integer[] NOT NULL,
  PRIMARY KEY(course_id,product_id)
);
DO $bc_import$
DECLARE
  payload jsonb := $bc_course_payload$'''+raw+'''$bc_course_payload$::jsonb;
  n integer;
  c record;
  r record;
  d text;
  b text;
  v record;
  v_season uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('malbun-2627-source-courses'));
  IF jsonb_array_length(payload)<>370 THEN RAISE EXCEPTION 'Course source cardinality drift'; END IF;
  SELECT id INTO v_season FROM public.seasons
  WHERE name='Winter 26/27' AND start_date=DATE '2026-12-01'
    AND end_date=DATE '2027-04-15' AND is_current IS TRUE;
  IF v_season IS NULL THEN RAISE EXCEPTION 'Current season drift'; END IF;
  IF EXISTS (SELECT 1 FROM public.bc_2627_course_period_sources)
    OR EXISTS (SELECT 1 FROM public.bc_2627_course_product_variants)
    OR EXISTS (SELECT 1 FROM public.group_courses g
               WHERE g.id IN (SELECT (p->>'course_id')::uuid FROM jsonb_array_elements(payload) p))
    OR EXISTS (SELECT 1 FROM public.training_groups g
               WHERE g.id IN (SELECT (p->>'group_id')::uuid FROM jsonb_array_elements(payload) p))
  THEN RAISE EXCEPTION 'Course import target collision / already applied'; END IF;
  IF (SELECT count(DISTINCT p->>'key') FROM jsonb_array_elements(payload) p)<>370
     OR (SELECT count(DISTINCT p->>'template_key') FROM jsonb_array_elements(payload) p)<>32
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(payload) p
                WHERE p->>'source_sha'<>'__SOURCE_SHA__'
                  OR p->>'level' NOT IN (SELECT id FROM public.skill_levels)
                  OR p->>'period_type' NOT IN ('weekday','saturday_series'))
  THEN RAISE EXCEPTION 'Source key, level or SHA mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) p,
         jsonb_each(p->'variants') variant
    LEFT JOIN public.products product ON product.id=variant.key::uuid
    WHERE product.id IS NULL OR product.season_id<>v_season OR product.is_active IS NOT FALSE
      OR product.type NOT IN ('group','group_toddler')
      OR product.min_age>(p->>'age_min')::int OR product.max_age<(p->>'age_max')::int
  ) THEN RAISE EXCEPTION 'Season/product/age/capacity preimage drift'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) p,
      jsonb_array_elements_text(p->'source_tariff_ids') sid(value)
      LEFT JOIN public.bc_product_tariff_sources t ON t.source_id=sid.value
    WHERE t.source_id IS NULL OR t.season_id<>v_season OR t.import_status<>'draft'
      OR t.source_sha256<>(p->>'source_sha')
      OR NOT (p->'variants' ? t.product_id::text)
  ) THEN RAISE EXCEPTION 'Source tariff/variant/capacity preimage drift'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) p
    WHERE (SELECT min((t.source_payload->>'group_capacity')::int)
           FROM public.bc_product_tariff_sources t
           WHERE t.source_id IN (SELECT value FROM jsonb_array_elements_text(p->'source_tariff_ids') ids(value)))
          IS DISTINCT FROM (p->>'capacity')::int
  ) THEN RAISE EXCEPTION 'Course capacity mismatch'; END IF;
  -- One stable course per discipline, level and schedule type; never one per
  -- product duration. Each course remains inactive until checkout is rebuilt.
  FOR c IN SELECT DISTINCT ON (j.item->>'template_key') j.item AS item
    FROM jsonb_array_elements(payload) AS j(item)
    ORDER BY j.item->>'template_key', j.item->>'period_start'
  LOOP
    INSERT INTO public.group_courses
      (id,name,description,discipline,skill_level_id,min_age,max_age,max_participants,
       price_per_day,product_id,is_active,is_internal,course_type,period_start_date,period_end_date)
    VALUES
      ((c.item->>'course_id')::uuid,
       '26/27 '||(CASE WHEN c.item->>'period_type'='saturday_series' THEN 'Samstag ' ELSE '' END)||(c.item->>'label'),
       'Booking-Corner 26/27: quellengeplante Vorlage. Preis nur aus Produkt-/Tarifquote.',
       CASE WHEN c.item->>'label' LIKE 'Snowboard %' THEN 'snowboard' ELSE 'ski' END,
       c.item->>'level',greatest(1,(c.item->>'age_min')::int),least(99,(c.item->>'age_max')::int),(c.item->>'capacity')::int,
       0,(c.item->>'primary_product')::uuid,false,false,
       CASE WHEN c.item->>'period_type'='saturday_series' THEN 'saturday_course' ELSE 'weekly' END,
       DATE '2026-12-01',DATE '2027-04-15');
    FOR v IN SELECT * FROM jsonb_each(c.item->'variants') LOOP
      INSERT INTO public.bc_2627_course_product_variants(course_id,product_id,eligible_day_counts)
      SELECT (c.item->>'course_id')::uuid,v.key::uuid,array_agg(day.value::integer ORDER BY day.value::integer)
      FROM jsonb_array_elements_text(v.value) day(value);
    END LOOP;
  END LOOP;
  SELECT count(*) INTO n FROM public.group_courses
  WHERE id IN (SELECT DISTINCT (p->>'course_id')::uuid FROM jsonb_array_elements(payload) p);
  IF n<>32 THEN RAISE EXCEPTION 'Course insert mismatch %',n; END IF;
  FOR r IN SELECT j.item AS item FROM jsonb_array_elements(payload) AS j(item) LOOP
    INSERT INTO public.training_groups(id,course_id,week_start,group_number,status,instructor_id,assistant_instructor_id)
    VALUES ((r.item->>'group_id')::uuid,(r.item->>'course_id')::uuid,(r.item->>'week_start')::date,1,'active',NULL,NULL);
    INSERT INTO public.bc_2627_course_period_sources
      (source_key,course_id,training_group_id,source_sha256,tariff_source_ids,teaching_dates,eligible_variants)
    SELECT r.item->>'key',(r.item->>'course_id')::uuid,(r.item->>'group_id')::uuid,r.item->>'source_sha',
      array_agg(DISTINCT ids.value ORDER BY ids.value),
      ARRAY(SELECT value::date FROM jsonb_array_elements_text(r.item->'dates') AS td(value)),r.item->'variants'
    FROM jsonb_array_elements_text(r.item->'source_tariff_ids') ids(value);
    FOR d IN SELECT jsonb_array_elements_text(r.item->'dates') LOOP
      FOR b IN SELECT jsonb_array_elements_text(r.item->'blocks') LOOP
        -- Schedules are inserted below only after all distinct times are known;
        -- instance FK remains NULL in this import and is later linked explicitly.
        INSERT INTO public.group_course_instances
          (id,course_id,date,start_time,end_time,instructor_id,assistant_instructor_id,status,current_participants)
        VALUES
          (md5('malbun-2627:instance:'||(r.item->>'key')||':'||d||':'||b)::uuid,
           (r.item->>'course_id')::uuid,d::date,split_part(b,'-',1)::time,split_part(b,'-',2)::time,
           NULL,NULL,'scheduled',0);
        IF r.item->>'period_type'='saturday_series' AND b=(r.item->'blocks'->>0) THEN
          INSERT INTO public.training_course_dates(id,training_id,date,is_cancelled,instructor_id)
          VALUES(md5('malbun-2627:saturday-date:'||(r.item->>'template_key')||':'||d)::uuid,
                 (r.item->>'course_id')::uuid,d::date,false,NULL);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  SELECT count(*) INTO n FROM public.bc_2627_course_period_sources;
  IF n<>370 THEN RAISE EXCEPTION 'Period source mismatch %',n; END IF;
  SELECT count(*) INTO n FROM public.group_course_instances
   WHERE course_id IN (SELECT DISTINCT course_id FROM public.bc_2627_course_period_sources);
  IF n<>3210 THEN RAISE EXCEPTION 'Lesson instance mismatch %',n; END IF;
  SELECT count(*) INTO n FROM public.training_course_dates
   WHERE training_id IN (SELECT DISTINCT course_id FROM public.bc_2627_course_period_sources);
  IF n<>150 THEN RAISE EXCEPTION 'Saturday dates mismatch %',n; END IF;
  -- Actual dates are taken ONLY from the source matrix, never an unconstrained
  -- active recurring schedule which could invent an extra week.
  INSERT INTO public.group_course_schedules(course_id,day_of_week,start_time,end_time,is_active)
  SELECT DISTINCT (p->>'course_id')::uuid,EXTRACT(DOW FROM d.value::date)::int,
         split_part(b.value,'-',1)::time,split_part(b.value,'-',2)::time,true
    FROM jsonb_array_elements(payload) p,
         jsonb_array_elements_text(p->'dates') d(value),
         jsonb_array_elements_text(p->'blocks') b(value);
  UPDATE public.group_course_instances gi SET schedule_id=s.id
    FROM public.group_course_schedules s
   WHERE gi.course_id=s.course_id AND gi.date BETWEEN DATE '2026-12-01' AND DATE '2027-04-15'
     AND s.day_of_week=EXTRACT(DOW FROM gi.date)::int
     AND s.start_time=gi.start_time AND s.end_time=gi.end_time
     AND gi.course_id IN (SELECT DISTINCT course_id FROM public.bc_2627_course_period_sources);
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>3210 THEN RAISE EXCEPTION 'Schedule linkage mismatch %',n; END IF;
END;
$bc_import$;
COMMIT;
'''
    header=header.replace('__SOURCE_SHA__',SOURCE_SHA)
    # PostgreSQL bytewise reproducibility: no timestamp or random IDs in output.
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(header,encoding='utf-8')
    print('Generated SQL',len(header.encode()),'bytes; 32 inactive templates; 370 groups; 3210 instances')


if __name__=='__main__': main()
