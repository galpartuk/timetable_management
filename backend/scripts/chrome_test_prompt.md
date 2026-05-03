# /chrome prompt — AI assistant Hebrew end-to-end test

Self-contained prompt for the Chrome browser agent. Copy the block below
into `/chrome`. Tests that the AI Command Center actually drives the
timetable when given Hebrew commands.

```
Test the AI timetable agent end-to-end on http://localhost:5173 in Hebrew.

CONTEXT
- React + Django app, Hebrew/RTL primary.
- Both servers must already be running:
  Django on :8000, Vite on :5173 (Vite proxies /api → Django).
- The AI assistant is a glassmorphic slide-out panel triggered by a
  floating gradient sparkle button bottom-corner, or by Ctrl+K.
- The model responds in Hebrew, streams text, and for mutating actions
  shows a yellow confirmation card before anything is written.

If localhost:5173 doesn't load, stop here and report
"servers not running".

LOGIN
1. Open http://localhost:5173.
2. If a tabbed login screen appears (Google / Phone / Password), click
   the small link at the bottom that says "התחברות עם שם משתמש וסיסמה"
   to reveal the Password tab, then click that tab.
3. Username: galpartuk007@gmail.com
   Password: Galpa2026!
   (case-sensitive: capital G, exclamation mark at the end)
4. Click submit. Should land on the dashboard.

NAVIGATE TO TIMETABLE
5. Click "מערכת שעות" in the sidebar. URL should change to /timetable.

OPEN THE COMMAND CENTER
6. Click the floating circular button bottom-corner (gradient purple,
   sparkle icon). Or press Ctrl+K.
7. A right-side slide-out panel appears with header "עוזר מערכת השעות"
   and quick-action chips in the empty state. (In RTL it may slide in
   from the LEFT edge — that's correct.)

TEST 1 — READ-ONLY HEBREW QUERY (find conflicts)
8. Click the quick action chip "מצא התנגשויות במערכת" (or type the
   prompt yourself: "בדוק התנגשויות במערכת הנוכחית והצג רשימה").
9. Expected, in order:
   a. A small pill labelled "find_conflicts" with a spinner appears
      inline. Within ~2s it switches to a green checkmark.
   b. Below it, a streaming Hebrew message appears character-by-
      character with a blinking caret cursor.
   c. The final assistant message reports either zero conflicts or a
      list, formatted with markdown / emoji.
10. PASS criteria: the pill appeared AND the response is Hebrew.

TEST 2 — MUTATING ACTION WITH CONFIRMATION (create timetable)
11. In the input box at the bottom of the panel, type:
    צור מערכת שעות חדשה לשנת 2028-2029 בשם "בדיקת דפדפן"
    Press Enter.
12. The model may run one or two read-only tools first (you'll see
    pills flash by — system_overview, list_assignments, etc.). That's
    expected; the system prompt tells it to verify before mutating.
13. A YELLOW/AMBER CARD should appear titled "דרושה אישור" with:
    - A chip showing "create_timetable"
    - Preview text in Hebrew describing the action
    - A JSON block showing {name: "בדיקת דפדפן", academic_year: "2028-2029", ...}
    - Two buttons: "ביטול" and "אשר וביצוע"
14. PASS criteria for this step: the card appeared with the correct
    name and year extracted from the Hebrew prompt. Capture the JSON
    contents.
15. Click "אשר וביצוע".
16. The card should disappear; a follow-up Hebrew message appears
    confirming the timetable was created. PASS criteria: the wrap-up
    message is Hebrew and mentions the new timetable name OR id.

TEST 3 — VERIFY THE TIMETABLE EXISTS IN THE REAL UI
17. Close the AI panel (click the X in its header).
18. Look at the timetable selector dropdown labelled "מערכת שעות" near
    the top of the page. Open it.
19. PASS criteria: "בדיקת דפדפן" appears in the dropdown with a status
    chip "טיוטה".
20. Select it. The grid below should be empty (just dashed cells) since
    we created but didn't generate.

TEST 4 — CLEANUP THROUGH THE UI
21. With "בדיקת דפדפן" selected, click the red "מחק" button between
    "Add" and "Generate".
22. A native confirm dialog asks "למחוק את 'בדיקת דפדפן'? הפעולה אינה
    הפיכה." Click OK.
23. PASS criteria: the timetable disappears from the dropdown.

REPORT
For each TEST 1..4, report PASSED / FAILED.
For any FAILED, include:
- What you saw vs. what was expected.
- Console errors visible in DevTools (F12 → Console).
- The status code + a snippet of the response body for the most recent
  /api/ai/chat/ or /api/ai/execute_tool/ request (DevTools → Network).

Also report:
- Whether the Hebrew text in the assistant's response actually streamed
  character-by-character (visible blinking cursor and growing text), or
  appeared all at once. The latter would indicate buffering between
  Vite and Django.
- Whether the confirmation card visually distinct from regular
  messages: amber/yellow background, "דרושה אישור" header.
- Whether RTL alignment is correct in the panel: input cursor on the
  right when typing Hebrew, message bubbles right-aligned for the user
  and left-anchored for the assistant.
```

---

## Notes for the user

- Test 2 is the big one: it proves the model correctly extracts the name and year from a Hebrew sentence and triggers the FE confirmation flow (the bug we fixed in commit 69c5ca3).
- Test 3 verifies the side effect actually persisted past the AI confirmation card — exercises the real DB write through `execute_tool`.
- Test 4 is optional cleanup, but doubles as a check that the new "מחק" button works.
- If Test 1's pill never appears but the streamed text does, the SSE proxy is fine but tool events aren't being parsed by the FE — likely a typed event format mismatch.
- If Test 2 hangs forever waiting for a card, the model probably asked for confirmation in text instead of calling the tool — that's the prompt bug we already fixed; pull latest main.
