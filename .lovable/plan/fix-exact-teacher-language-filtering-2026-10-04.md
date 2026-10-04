# Fix exact teacher-language filtering

## Scope
- Change only the shared teacher eligibility helper so an explicitly selected language requires that exact stored language code (`de`, `en`, `fr`, or `it`).
- Keep no-language selection unrestricted and preserve active-status and sport filtering.
- Add focused tests for exact language matching, empty/missing language arrays, inactive teachers, and wrong-sport teachers.
- Verify the shared list and mini scheduler continue using this single helper.

## Validation
- Run the focused teacher-shortlist tests, TypeScript check, and diff check.
- In the synthetic booking preview, select French, confirm only French-capable teachers appear, switch language, and confirm the list updates while blocking all external writes.
- Leave the change unpublished with no backend or data changes.
