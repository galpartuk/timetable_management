# Scheduling decisions — תשפ"ז

This document explains the model, constraints, and trade-offs encoded in the
pool-aware solver at `solver/engine.py`. It exists so the next person to
touch this code can understand *why* a constraint is the way it is, not
just what it does.

## The school's structure

Six grades (ז–יב) × roughly nine classes per grade = ~55 classes. Each
class is in one of several pedagogical tracks: regular, חינוך מיוחד (special
ed), מנהיגות (leadership), מופת מדעית, עתודה מדעית, אומ"ץ, מב"ר, תל"מ.

Time slots: 5 days × 10 periods = **50 slots/week** per class. Periods 1–10
are sequential through the day; the solver does not currently treat any
particular slot as "lunch" — that's left to the school's lunch policy.

Most subjects are **class-bound**: one teacher teaches one class for a
fixed number of hours/week. But high-school math, English, and a few
others are **pooled**:

- Several classes (e.g., יא 1, 2, 5, 6, 7, 9) share the same time slots
  for that subject.
- Within those slots, students from any of the pool's classes are split
  into ability tracks (3 / 4 / 5 יח"ל) and taught by different teachers
  in parallel rooms.
- The class's calendar shows "math" for the slot; the *specific* teacher
  depends on which ability track the student is in.

This shape is what the `ScheduleBlock` data structure in `engine.py`
captures.

## What we schedule

Every `TeachingAssignment` row in the DB with `is_active=True` AND
`teacher__isnull=False` is in scope. Specifically:

- **Active core subjects** are scheduled — מתמטיקה, אנגלית, חינוך, תנך,
  לשון, ספרות, היסטוריה, אזרחות, גיאוגרפיה, מדעים, חינוך גופני, ערבית,
  אומנות, חינוך תעבורתי, חינוך פיננסי, של"ח, קוד דרכא, מחשבת ישראל.
- **Bagrut electives** (ביולוגיה, כימיה, פיזיקה, מדעי המחשב,
  ביוטכנולוגיה, תעשייה וניהול, מנהל וכלכלה, מדעי החברה, אדריכלות,
  פיקוד ובקרה) are *imported but marked inactive* for high-school grades
  (י, יא, יב). The audience is self-selected (students who chose that
  bagrut), not the whole class, so they can't be class-bound. The school
  reserves a "bagrut window" each week and books these manually.
- **Rows tagged "פתיחה מותנית"** (conditional opening) are imported as
  inactive — the school will activate them once enrollment is confirmed.
- **Rows where the teacher cell is empty** are imported but inactive, so
  the gap-analysis report can flag them but the solver doesn't trip on
  null FKs.

After applying these filters: **~494 active assignments → 397 schedule
blocks → 2720 lesson entries** for the full school.

## Decisions baked into the solver

### 1. One block per (subject, group_key)

A `group_key` shared across rows marks them as belonging to the same
*pool*. The importer assigns `group_key` whenever a row is part of a
continuation chain — i.e., its `כיתה` cell is empty and it inherits the
previous row's class list. Multi-class pools (`יא 1,2,5,6,7,9`) and
single-class ability families (`י7` followed by 5/4-יח"ל continuation
rows) both end up sharing a group_key, so both kinds collapse into one
block.

### 2. Tracks alias the leading prefix of the block's slot list

A block of `max(track.weekly_hours)` slots has all parallel tracks point
into the same `IntVar` list. So:

- A 5-יח"ל track (8 hours) covers slots 0–7.
- A 4-יח"ל track (6 hours) covers slots 0–5 — the first 6 of the same
  list.
- A 3-יח"ל track (4 hours) covers slots 0–3.

The teacher of the 4-יח"ל track is free during slots 6–7 (only the
5-יח"ל teacher is teaching then). The class's calendar still shows math
for all 8 slots.

### 3. Per-teacher all_different is over flattened track slots

For each teacher, we collect every slot var they touch (across every
block they're in) and add `all_different`. A teacher who appears in two
rows of one pool — e.g., two parallel 5-יח"ל sub-groups — is **merged
into one track with summed hours** at block-build time. Real-world
meaning: that teacher teaches one sub-group then the next, serially. The
parallel-teacher fiction (two rooms simultaneously) doesn't apply to the
same physical person.

### 4. Per-class all_different is over the union of block slots they belong to

A pool block contributes its slot_vars to *every* member class's set.
So the all_different on יא1 covers both יא1-only blocks and the math
pool's slots (the same 8 vars that יא2, יא5, יא6, יא7, יא9 also count).
This is what guarantees the pool is locked to one set of slots across
all members.

### 5. Teacher day-off honored as `var != bad_slot`

If `Teacher.day_off` is set, every slot var the teacher owns must not
equal any slot on that day. We add these as explicit `add(var != slot)`
constraints rather than via the registry — it's straightforward, runs
during presolve, and doesn't blow up the variable count. No teacher
currently has `day_off` set in production; the constraint is wired up
ready for when they do.

### 6. Default soft constraints

The school didn't (yet) author its own `Constraint` records, so the
engine applies two defaults to make the output look like a real
timetable:

- **Max 10 lessons/day per class.** Matches the 10-period day. Almost
  always non-binding; trips only on the unusually-loaded classes.
- **Max 4 lessons/day per subject per class.** Subjects with 3 or fewer
  lessons/week are unaffected. Math (8h), English (4h), Hebrew (4h),
  Tanakh, Geography, etc. are all kept from piling onto two days.
  - We tried 2/day first — infeasible against teacher day-offs and
    pooled-block constraints. 3/day infeasible for the same reason.
    4/day is the looser bound that still produces realistic timetables.
  - Both defaults are silenced by adding a `Constraint` of type
    `max_daily_hours_class` or `consecutive_hours` (any parameters).

These are encoded efficiently: one `slot → day` element-constraint per
slot var, then per-day count indicators. Avoids the `O(N × M)` boolean
explosion of the naive "for each var, for each slot in day" encoding.

### 7. Solver settings

- `max_time_in_seconds = 300` (production), `60` (development).
- `num_search_workers = 8`.
- `linearization_level = 2` — helps the dense `all_different` networks.
- Decision strategy: pin the biggest, most-constrained blocks first
  (sorted by `hours × |classes|`, descending), `CHOOSE_FIRST`,
  `SELECT_MIN_VALUE`. Solves the production data to OPTIMAL in 10–15 s.

## Trade-offs and what's deliberately *not* modeled

1. **Lunch break.** No "free slot for lunch" constraint. Many timetables
   have a midday hour reserved; we don't enforce that. To add, drop a
   `Constraint` of type `teacher_availability` blocking the slot for
   every teacher (or extend the registry with a `lunch_period` handler).

2. **Room assignment.** `TimetableEntry.room` is `null=True`; the solver
   does not pick rooms. The school's curriculum sheet does not encode
   room requirements, and Room records on the DB are empty. To add,
   model rooms as another resource (their own `all_different` per slot)
   and link subjects to room types.

3. **Bagrut electives.** As above — imported inactive for high school.
   To re-include, the school needs to designate a "bagrut window"
   (specific day+period pairs) and add a constraint that pins these
   assignments to those slots. The data is in the DB; only the
   scheduling policy is missing.

4. **Consecutive-hour pairing.** Math and Hebrew sometimes want
   double-period blocks. Not currently enforced; the existing
   `consecutive_hours` Constraint type's handler caps daily count
   rather than forcing consecutive placement. To add, model "pairs"
   explicitly with `add_modulo_equality` on the per-day position
   inside the day.

5. **Cross-class group sub-grouping.** Some pools (e.g., math 4-יח"ל
   for יא 1,2,5,6,7,9) further split each track into smaller groups
   with different teachers (the importer rolls these into one track,
   summing hours). The current model treats the teacher as one entity
   that hops between sub-groups; rooms are not modeled, so this is
   silent. If two sub-groups truly need disjoint slots (because the
   teacher physically can't, or because students from one class must
   not overlap), split the import into multiple tracks per teacher.

6. **Teacher load smoothing.** No "balance hours per day for each
   teacher" objective. The default solver finds an optimal *feasible*
   schedule; "fair" load distribution is not currently optimized for.
   Adding it would be an `cp_model.LinearExpr` objective minimizing
   max-day-load deviation per teacher.

## Observability

Each `Timetable` row gets a `solver_log` string with:
- Whether OPTIMAL or FEASIBLE was reached.
- Block / track / entry counts.
- Teacher / class / time-slot counts.
- Wall-clock solve time.
- Any unhandled Constraint types listed by name.

For deeper inspection: `Timetable.entries` (FK `timetable_entries`) gives
every (class, slot) → (subject, teacher) mapping. The Manage page's
import gap-analysis view shows which assignments were *excluded* from
scheduling and why.

## When the solver fails

- **0.0s INFEASIBLE** = structural conflict found in presolve. Most
  common cause: a teacher has more lesson-hours than the schedule has
  slots, or a class does. Check the gap-analysis report.
- **>60s UNKNOWN** = timed out. Increase `max_time_seconds`; if that
  doesn't help, the default constraint set may be over-tight — try
  adding looser `Constraint` records.
- **Specific subject FK errors** during `bulk_create` of entries =
  data race; the parser left a stale subject reference. Re-run the
  importer with `wipe_existing=True`.

---

## The objective function — and why it matters

The solver doesn't just find a *feasible* timetable; it finds one
that **minimizes a weighted sum** of three undesirable properties.
Feasibility-only gave us this:

- 1097 teacher windows (avg 6.8 per teacher, worst was 24)
- 629 class windows
- ~310 lessons in late periods (9, 10)

…which is technically valid but operationally awful: teachers would
sit at school during their windows waiting for the next class, classes
would have free periods mid-day, and afternoons would be packed with
academic subjects.

With the objective function active, the same input produces:

- **29 teacher windows** (a 97% reduction; avg 0.18, worst is 6)
- **6 class windows** (a 99% reduction)
- Tighter morning loading

The objective is, in priority order:

### Weight 10 — Teacher windows (חלונות)

For each (teacher, day, period) with the teacher idle at that period
but having lessons both before and after the same day, we add a
boolean cost. Encoded as `window = (1 − has_lesson) ∧ before ∧ after`
where `before` and `after` are bool indicators over the teacher's
other lessons that day. This dominates the objective — Israeli
high-school teachers strongly prefer back-to-back days with no gaps.

### Weight 3 — Class windows

Same shape for classes. Lower weight because students tolerate
mid-day gaps better than teachers (a free period can mean homework
or socializing), but mid-day windows still get penalized.

### Weight 1 — Late-period lessons

Each slot in period 9 or 10 adds 1 to the objective. Acts as a
tiebreaker that pushes lessons toward the morning. Heavy academic
subjects don't get specific treatment yet (see follow-ups) but the
school can add `Constraint(no_last_period, subject=math)` to give
math priority.

### Trade-offs of objective optimization

The objective grows the model significantly:

- ~ 8,000 additional boolean variables (has_lesson cells per
  (teacher, day, period) and per (class, day, period))
- ~ 4,000 additional bool windows + before/after auxiliaries

Solve time went from 3.4 s (feasibility) → ~120 s for an excellent
feasible solution (97% better). Optimality proof can take longer but
isn't usually worth waiting for — the marginal improvement past the
first feasible-with-objective solution is tiny.

To prioritize speed over quality, set `max_time_seconds` lower (e.g.,
30 s) and accept a sub-optimal solution. Status `FEASIBLE` is fine —
the school cares about *low* windows, not provably-optimal windows.

---

## Roadmap (ranked by impact × ease)

### High value — short term

1. **Lunch-window enforcement.** Reserve period 5 or 6 as a no-class
   slot for at least *one* of (class, teacher) per grade level. The
   school typically operates on a 4–5 / 6–10 structure with a midday
   break.
2. **Per-teacher availability windows.** Many teachers prefer "no
   first period on Sundays" or "free Thursday afternoon". The
   `Constraint(teacher_availability)` handler already supports this;
   the missing piece is a UI for entering preferences and a way to
   distinguish hard ("can't") from soft ("prefer not to") preferences.
3. **Soft vs hard distinction.** Currently every Constraint record is
   a hard constraint. Switching `Constraint.priority='soft'` should
   add a weighted penalty to the objective instead of a constraint —
   the engine doesn't yet do this.
4. **Subject-period preferences.** Add a "prefer mornings" weight for
   math/English (multiplier on the late-period penalty when the
   subject is on the list). Easy CP-SAT add, big quality win.

### Medium value — medium term

5. **Room scheduling.** Add a Room model + `all_different` over
   (room, slot). Subjects can require a specific room (e.g., chem
   lab, gym). The model + solver hook is straightforward; the
   adoption blocker is collecting the room-requirement data.
6. **Double-period pairs.** Math, lab subjects, and art classes are
   often scheduled as doubles. Currently the solver treats every
   lesson as a single period. Encoding "lessons X and Y must be
   consecutive" requires `add_modulo_equality(slot_X, periods_per_day)
   == add_modulo_equality(slot_Y, periods_per_day) ± 1`.
7. **Multiple-timetable comparison.** Generate 3 timetables with
   different objective weights; let the principal browse all three
   and pick. Just a UI iteration over the existing solver.
8. **Lock-and-iterate.** Pin specific entries the user is happy with
   (a "lock" checkbox on each cell) and re-solve only the rest. The
   solver wires this in via `add(var == fixed_value)` for locked
   lessons.

### Low value — long term

9. **Bagrut window auto-placement.** Today bagrut electives are
   imported as inactive — the school books them manually. We could
   add a "bagrut window" Constraint type that designates specific
   slots for bagrut subjects, then re-include those assignments.
10. **Student schedules.** Currently we schedule classes, not
    students. For schools where students cross-attend, modeling per-
    student timetables (with parent ↔ child class membership) would
    enable better elective scheduling.
11. **Teacher load smoothing.** Minimize max(teacher_daily_load) −
    min(teacher_daily_load) so a teacher's hours are spread evenly
    instead of "5 hours Monday, 0 hours Tuesday". Costs in solve time
    but creates a fairer schedule.
12. **What-if scenarios.** Save multiple objective-weight presets
    (e.g., "teacher-friendly", "morning-heavy", "lunch-strict"), let
    the user toggle and compare.

### Quality observability — already shipped (2026-05-18)

- `GET /api/timetables/{id}/quality/` returns per-teacher and per-class
  window counts plus an aggregate score. Used by the new dashboard
  and inline grid annotations.
- The /timetable page shows windows in teacher view as orange dashed
  cells labeled "חלון", with a side panel listing per-day window
  counts and day spans.
- The /manage page has a new "איכות מערכת" tab with the worst-15
  teachers by windows, classes with windows, and aggregate metrics.
