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
