# Fix Scheduler Role Filter for Office Staff

## Status: ✅ Completed

## Problem (Solved)

The role filter in the scheduler didn't work for office staff because:
1. The `role` column was always "instructor" for everyone
2. Office vs teaching staff is determined by the `roles` TEXT[] array
3. The filter logic checked `i.role === roleFilter` which never matched "office_staff"

## Solution Implemented

Added `roleType` derived from the `roles` array for proper filtering.

## Changes Made

| File | Change |
|------|--------|
| `useSchedulerData.ts` | Added `roleType` derived from `roles` array, removed ineffective DB filter |
| `scheduler-utils.ts` | Added `roleType` to `SchedulerInstructor` type |
| `SchedulerGrid.tsx` | Updated filter to use `roleType` instead of `role` |

## Result

- "Skilehrer" filter shows instructors with teaching roles (`ski`/`snowboard`)
- "Büropersonal" filter shows staff with only office role (`['office']`)
- "Alle" shows everyone
