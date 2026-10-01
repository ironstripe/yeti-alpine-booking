#!/usr/bin/env python3
"""Build the Malbun 26/27 inactive product draft migration from the approved snapshot.

The source is Booking-Corner data captured on 2026-09-30. This script never connects
 to the database. It refuses source drift and missing/duplicate/ambiguous prices.
"""
from __future__ import annotations

import csv
import hashlib
import json
import uuid
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'supabase/seed/booking_corner_tariffs_2026_27.csv'
EXPECTED_SHA256 = 'b5db33ab54a9c9565edd6541461a3b982afc4a5f78ded6bbd833e99ee3f14d67'
NAMESPACE = uuid.UUID('7b7c6738-680a-4763-a704-c25e02daa42c')
TARGET = Path(__file__).resolve().parents[1] / 'supabase/migrations/20261001194500_malbun_2627_product_drafts.sql'


def normalize(row: dict[str, str]) -> dict:
    family = row['source_family']
    sport = row['sport']
    if family == 'Privatkurs':
        key = f'private:{sport.lower()}'
        status = 'draft'
    elif sport == 'Betreuung':
        key = None
        status = 'deferred_care'
    else:
        saturday = family == 'Samstagkurs'
        activities = row['source_activities']
        if sport == 'Snowboard':
            segment = 'snowboard'
        elif 'Windel-Wedelkurs' in activities and int(row['course_capacity_or_person_max']) in (8, 13) and (family == 'Samstagkurs' or int(row['duration_minutes_per_day']) == 120):
            segment = 'toddler'
        elif 'Erwachsene Wiedereinsteiger' in activities:
            segment = 'returners'
        elif 'Erwachsene' in activities:
            segment = 'adults'
        elif 'Swiss Snow Kids Village' in activities:
            segment = 'kids'
        else:
            raise ValueError(f'Unmapped activity for source {row["source_dom_id_candidate"]}')
        key = f'{"saturday" if saturday else "weekday"}:{sport.lower()}:{segment}:{row["duration_minutes_per_day"]}'
        status = 'draft'
    return dict(
        source_id=row['source_dom_id_candidate'],
        product_key=key,
        status=status,
        family=family,
        sport=sport,
        source_row=int(row['source_row']),
        source_description=row['source_description'],
        source_activities=row['source_activities'],
        source_validity=row['source_validity'],
        duration_minutes=int(row['duration_minutes_per_day']),
        day_count=int(row['booked_days']),
        persons=int(row['persons_per_lesson']),
        group_capacity=int(row['course_capacity_or_person_max']),
        amount=str(Decimal(row['source_price_amount']).quantize(Decimal('.01'))),
    )


def product_definition(key: str, rows: list[dict]) -> dict:
    first = rows[0]
    private = key.startswith('private:')
    sport = first['sport']
    if private:
        title = f'Privatunterricht {sport}'
        kind, audience, minutes, price, pricing = 'private', 'mixed', 60, '75.00', 'fixed'
        description = 'Booking-Corner 26/27: interner Entwurf. Dauer-/Personenpreise aus der Import-Tarifmatrix; aktuelle YETI-Buchung und Rechnung verwenden diese Matrix noch NICHT. Nicht aktivieren.'
    else:
        _, _, segment, minute_str = key.split(':')
        minutes = int(minute_str)
        saturday = key.startswith('saturday:')
        segment_name = {'toddler': 'Windel-Wedelkurs', 'returners': 'Wiedereinsteiger', 'adults': 'Erwachsene', 'kids': 'Kinder & Swiss Snow League', 'snowboard': 'Anfänger/Fortgeschritten'}[segment]
        title = f'{"Samstagskurs" if saturday else "Gruppenkurs"} {sport} {segment_name} {minutes // 60}h'
        kind = 'group_toddler' if segment == 'toddler' else 'group'
        audience = 'adults' if segment in ('returners', 'adults') else 'kids'
        if sport == 'Snowboard':
            audience = 'mixed'
        price, pricing = '0.00', 'tiered'
        capacities = sorted({r['group_capacity'] for r in rows})
        description = ('Booking-Corner 26/27: interner Entwurf. Kumulative Tagespreise nur fuer die aus Booking belegten Tageszahlen. '
                       f'Quell-Kapazitaet(en) {capacities}. Aktivitaetsvarianten und konkrete Kurszeiten muessen separat abgenommen werden. Nicht aktivieren.')
    return dict(
        product_key=key, product_id=str(uuid.uuid5(NAMESPACE, 'malbun-2627:'+key)),
        name=title, description=description, type=kind, audience=audience,
        discipline=sport.lower(), reporting_category='private' if private else 'group',
        duration_minutes=minutes, pricing_type=pricing, price=price,
        capacity_max=max((r['group_capacity'] for r in rows), default=5),
    )


def main() -> None:
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED_SHA256, 'Tariff snapshot drift'
    records = [normalize(r) for r in csv.DictReader(SOURCE.open(encoding='utf-8'))]
    assert len(records) == 121 and len({r['source_id'] for r in records}) == 121
    assert len([r for r in records if r['status'] == 'deferred_care']) == 6
    assert len([r for r in records if r['family'] == 'Privatkurs']) == 70
    teaching = [r for r in records if r['status'] == 'draft' and r['family'] != 'Privatkurs']
    assert len(teaching) == 45
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        if r['product_key']:
            grouped[r['product_key']].append(r)
    products = [product_definition(k, v) for k, v in sorted(grouped.items())]
    assert len(products) == 15, f'Expected 13 group + 2 private products; got {len(products)}'
    assert len({p['product_id'] for p in products}) == len(products)
    seen_tiers = set()
    for r in teaching:
        tier=(r['product_key'],r['day_count'])
        if tier in seen_tiers:
            raise ValueError(f'Duplicate day tier {tier}')
        seen_tiers.add(tier)
    assert len(seen_tiers)==45
    for sport in ('Ski','Snowboard'):
        prs = [r for r in records if r['family']=='Privatkurs' and r['sport']==sport]
        assert {(r['duration_minutes'],r['persons']) for r in prs} == {(m,n) for m in range(60,421,60) for n in range(1,6)}
        bases = {r['duration_minutes']:Decimal(r['amount']) for r in prs if r['persons']==1}
        for r in prs:
            assert Decimal(r['amount']) == bases[r['duration_minutes']] + Decimal(20*(r['persons']-1)*r['duration_minutes']//60)
    amounts = {r['source_id']:r['amount'] for r in records}
    assert len(amounts)==121
    # Source identity, pricing and activities are preserved, including deferred care rows.
    payload = {'products':products,'tariffs':records}
    text = json.dumps(payload,ensure_ascii=False,separators=(',',':'),sort_keys=True)
    assert '$bc_json$' not in text
    template = Path(__file__).with_name('booking_products_2627.template.sql').read_text()
    sql = template.replace('__SOURCE_SHA256__',EXPECTED_SHA256).replace('__SOURCE_JSON__',text)
    assert '__SOURCE_' not in sql
    TARGET.write_text(sql)
    print(json.dumps({'products':len(products),'group_products':sum(p['type']!='private' for p in products),'private_products':sum(p['type']=='private' for p in products),'group_tiers':len(seen_tiers),'private_rates':70,'deferred_care':6,'source_rows':len(records),'source_sha256':EXPECTED_SHA256,'sql_sha256':hashlib.sha256(sql.encode()).hexdigest()},indent=2))


if __name__=='__main__':
    main()
