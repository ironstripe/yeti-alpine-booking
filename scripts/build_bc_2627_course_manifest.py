#!/usr/bin/env python3
"""Build a source-backed 26/27 course plan; never writes to YETI Cloud.

Usage: python3 scripts/build_bc_2627_course_manifest.py CANDIDATES.csv OUTPUT.csv
The input is the private/reviewed Booking-Corner period matrix, not a scraped guess.
Missing skill level IDs are explicitly marked NEW, not aliased to another level.
"""
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILE = ROOT / 'supabase/migrations/20261001194500_malbun_2627_product_drafts.sql'
SOURCE_SHA = 'b5db33ab54a9c9565edd6541461a3b982afc4a5f78ded6bbd833e99ee3f14d67'
LEVELS = {
    'Ski Windel-Wedelkurs': 'ski_windel_wedel',
    'Ski Swiss Snow Kids Village': 'ski_snow_kids',
    'Ski Blauer Prinz/Prinzessin': 'ski_blauer_prinz',
    'Ski Blauer König/Königin': 'ski_blauer_koenig',
    'Ski Blauer Star': 'ski_blauer_star',
    'Ski Roter Prinz/Prinzessin': 'ski_roter_prinz',
    'Ski Roter König/Königin': 'ski_roter_koenig',
    'Ski Roter Star': 'ski_roter_star',
    'Ski Schwarzer Prinz/Prinzessin': 'ski_schwarzer_prinz',
    'Ski Schwarzer König/Königin': 'NEW:ski_schwarzer_koenig',
    'Ski Swiss Snow Academy': 'ski_academy',
    'Ski Kinder Fortgeschritten': 'NEW:ski_kids_advanced',
    'Ski Erwachsene Anfänger': 'ski_adult_green',
    'Ski Erwachsene Fortgeschritten': 'ski_adult_blue',
    'Ski Erwachsene Wiedereinsteiger': 'NEW:ski_adult_returners',
    # Source does not distinguish ages; adult IDs below are placeholders for
    # scheduling, not permission to reject child snowboarders online.
    'Snowboard Anfänger': 'REVIEW:sb_adult_green',
    'Snowboard Fortgeschritten': 'REVIEW:sb_adult_blue',
}


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    candidate, output = map(Path, sys.argv[1:])
    raw = SOURCE_FILE.read_text()
    match = re.search(r'\$bc_json\$(\{.*?\})\$bc_json\$', raw, re.S)
    if not match:
        raise ValueError('BC import source JSON missing')
    source = json.loads(match.group(1))
    products = {p['product_key']: p for p in source['products']}
    tariffs = {str(t['source_id']): t for t in source['tariffs']}
    with candidate.open(newline='', encoding='utf-8-sig') as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 370 or len(products) != 15 or len(tariffs) != 121:
        raise ValueError('Source cardinality drift')
    results = []
    seen = set()
    for r in rows:
        if r['source_snapshot'] != '2026-09-30' or r['source_snapshot_sha256'] != SOURCE_SHA:
            raise ValueError('Source snapshot drift')
        label = r['booking_activity_label']
        if label not in LEVELS:
            raise ValueError(f'Unmapped level: {label}')
        kind = r['period_type']
        if kind not in ('weekday', 'saturday_series'):
            raise ValueError(f'Unknown period: {kind}')
        start, end = date.fromisoformat(r['period_start']), date.fromisoformat(r['period_end'])
        if not (date(2026, 12, 1) <= start <= end <= date(2027, 4, 15)):
            raise ValueError('Period outside target season')
        if kind == 'saturday_series' and (r['series'],start,end) not in (
            ('S1',date(2027, 1, 9),date(2027, 2, 6)),
            ('S2',date(2027, 2, 20),date(2027, 3, 20)),
        ):
            raise ValueError('Saturday source series changed')
        key = (kind, r['period_start'], label)
        if key in seen:
            raise ValueError(f'Duplicate level-period {key}')
        seen.add(key)
        ids = r['source_tariff_ids'].split('|')
        if r['week_start'] != (start-timedelta(days=start.weekday())).isoformat():
            raise ValueError(f'Incorrect Monday anchor {key}')
        if not ids or len(ids)!=len(set(ids)) or any(i not in tariffs for i in ids):
            raise ValueError(f'Missing tariff evidence {key}')
        options = defaultdict(list)
        for sid in ids:
            t = tariffs[sid]
            if t['status'] != 'draft' or t['family'] != ('Samstagkurs' if kind == 'saturday_series' else 'Gruppenunterricht'):
                raise ValueError(f'Wrong tariff family {sid}')
            if label not in t['source_activities'].split(' | '):
                raise ValueError(f'Activity mismatch {sid} / {label}')
            product = products.get(t['product_key'])
            if not product or product['type'] not in ('group','group_toddler'):
                raise ValueError(f'Missing product variant {sid}')
            options[product['product_id']].append(t)
        # A single operating group per level-period, even with 2h + 4h products.
        variants = sorted(options, key=lambda pid: products[next(k for k,p in products.items() if p['product_id']==pid)]['duration_minutes'])
        durations = {products[next(k for k,p in products.items() if p['product_id']==pid)]['duration_minutes'] for pid in variants}
        if not durations or not durations.issubset({120,240}):
            raise ValueError(f'Unsupported duration {key}')
        main_product_id = next(pid for pid in variants if any(t['duration_minutes']==max(durations) for t in options[pid]))
        day_dates = []
        cursor = start
        while cursor <= end:
            if (kind == 'saturday_series' and cursor.weekday()==5) or (kind == 'weekday' and cursor.weekday()<5):
                day_dates.append(cursor.isoformat())
            cursor += timedelta(days=1)
        if not day_dates or len(day_dates)>5:
            raise ValueError('Empty or oversized scheduling period')
        # A 4h product runs in two genuine 2h lessons, not a 10–14 block.
        blocks = '10:00-12:00|14:00-16:00' if 240 in durations else '10:00-12:00'
        results.append({
            'period_type':kind, 'period_start':r['period_start'],'period_end':r['period_end'],
            'week_start':r['week_start'],'series':r['series'],
            'booking_activity_label':label,'skill_level_id':LEVELS[label],
            'primary_product_id':main_product_id,'eligible_product_ids':'|'.join(variants),
            'source_tariff_ids':'|'.join(ids),
            'variant_day_counts':json.dumps({pid: sorted({t['day_count'] for t in options[pid]}) for pid in variants},sort_keys=True),
            'teaching_dates':'|'.join(day_dates),'schedule_time_blocks':blocks,
            'capacity_max':str(min(products[next(k for k,p in products.items() if p['product_id']==pid)]['capacity_max'] for pid in variants)),
            'instructor_id':'', 'lunch_included':'false', 'status':'PREPARED_NOT_ACTIVE',
            'source_snapshot_sha256':SOURCE_SHA,
        })
    if len(results)!=370 or len(seen)!=370:
        raise ValueError('Output cardinality mismatch')
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('w',encoding='utf-8',newline='') as handle:
        writer=csv.DictWriter(handle,fieldnames=results[0].keys());writer.writeheader();writer.writerows(results)
    print('SOURCE-BACKED DRY RUN',len(results),'level-periods',
          Counter(x['period_type'] for x in results),'instances',
          sum(len(x['teaching_dates'].split('|'))*len(x['schedule_time_blocks'].split('|')) for x in results),
          'new/review mappings',Counter(x['skill_level_id'] for x in results if x['skill_level_id'].startswith(('NEW:','REVIEW:'))))


if __name__ == '__main__':
    main()
