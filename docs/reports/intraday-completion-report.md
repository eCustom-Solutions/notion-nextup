### Intraday Completion Calculation Report

Date: 2025-08-14
Workday: 8:00 AM – 4:00 PM (8 hours)
Assumptions:
- Only weekday hours (Mon–Fri) count; weekends are excluded
- Estimated days convert to hours: hours = estimatedDays × 8
- Tests executed via `npx ts-node --transpile-only src/tests/intraday-completion-test.ts`
- Times displayed in local system timezone at test-run

### Summary
- Passed: 22
- Failed: 4

### Key Passed Cases (sampling)
- Small/half/full day (0.1 / 0.5 / 1.0 days) within a day
- Boundary roll at 4:00 PM (0.75 days from 10:00 → next day 8:00)
- Carry remainder into next day (0.5 from 2:00 PM → next day 10:00 AM)
- Late-afternoon overflow (3:30 PM + 0.1d → next day 8:18 AM)
- Friday over weekend (Fri 2:00 PM + 0.5d → Mon 10:00 AM)
- Weekend start normalization (Sat/Sun start → Monday at 8:00 + remainder)
- Multi-day with weekend skip (2.25 days Thu 8:00 → Mon 10:00)
- Multi-day longer spans (4.125 days Thu 8:00 → Wed 9:00; 7.999 days → next Mon 4:00 PM)

### Failed Cases and Circumstances
1. Large task (5.75 days)
   - Start: Thu 8:00 AM
   - Estimated: 5.75 days → 46 hours
   - Expected: Fri 2:00 PM (next week)
   - Actual: Thu 2:00 PM (previous day)
   - Note: Off by one business day across multi-day span; likely day-stepping/weekly rollover interaction.

2. Tiny task near day end (0.02 days at 3:59 PM)
   - Start: Thu 3:59 PM
   - Estimated: 0.02 days → 9.6 minutes
   - Expected: Fri 8:09 AM
   - Actual: Fri 8:09 AM
   - Note: One-minute rounding discrepancy resolved by round-up policy.

3. Sub-minute near day end (0.001 days at 3:59 PM)
   - Start: Thu 3:59 PM
   - Estimated: 0.001 days → 0.48 minutes
   - Expected: Fri 8:00 AM
   - Actual: Thu 4:00 PM
   - Note: Finishes at exactly 4:00 PM; policy intends to roll to next day (since not started at day start). Our boundary-detection/rounding missed the roll.

4. Nearly full day (0.99 days at 8:00 AM)
   - Start: Fri 8:00 AM
   - Estimated: 0.99 days → 7.92 hours
   - Expected: Fri 3:55 PM
   - Actual: Fri 3:56 PM
   - Note: One-minute rounding issue on fractional-minute handling; tighten rounding.

### Observations / Decisions
- Boundary at 4:00 PM: adopted
  - If completion hits 16:00 and task did not start at day start, roll to next business day 8:00.
  - If started at 8:00 and finishes exactly 16:00, keep same day.
- Remainder handling: adopted
  - Carry remainder hours into the next business day (no clamping to 8:00 unless policy dictates at boundary roll).
- Rounding:
  - Current tests surface ±1 minute differences; standardize to round up to the nearest minute to avoid early completion.

### Next Steps
- Fix multi-day off-by-one in long spans (case 1)
- Enforce boundary roll at exactly 16:00 for late-day starts (case 3)
- Normalize rounding to always round up to the next minute for sub-minute and fractional-minute cases (cases 2 and 4)
- After fixes, re-run and update this report
