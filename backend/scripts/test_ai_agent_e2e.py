"""End-to-end integration test for the AI timetable agent.

Drives the real HTTP endpoints (/api/ai/chat/ + /api/ai/execute_tool/)
via Django's test Client — exercises views, auth, SSE encoding, the tool
registry, and the Anthropic API. No browser, no running server needed.

Run from the project root:

    .venv/Scripts/python.exe backend/manage.py shell \
        -c "exec(open(r'backend/scripts/test_ai_agent_e2e.py', encoding='utf-8').read())"

Requires:
- A super-admin user with email galpartuk007@gmail.com (created in earlier
  bootstrap; adjust the constant in login_client() if your user differs).
- backend/.env with a valid ANTHROPIC_API_KEY.
- Costs Anthropic API credits each run (~$0.05-0.10).

Cleans up after itself: deletes any timetable it creates.
"""
import json
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from django.contrib.auth import get_user_model
from django.test import Client

from apps.scheduling.models import Timetable

User = get_user_model()


# ── helpers ──────────────────────────────────────────────────────────────

def parse_sse_body(body: bytes):
    """Iterate (event, data) pairs from a complete SSE response body."""
    text = body.decode('utf-8', errors='replace')
    for frame in text.strip().split('\n\n'):
        event = None
        data_lines = []
        for line in frame.split('\n'):
            if line.startswith('event:'):
                event = line[6:].strip()
            elif line.startswith('data:'):
                data_lines.append(line[5:].strip())
        if event and data_lines:
            try:
                yield event, json.loads('\n'.join(data_lines))
            except json.JSONDecodeError:
                pass


def login_client() -> Client:
    """Authenticated test client for the super-admin we created earlier.

    Default HTTP_HOST is 'testserver' which isn't in ALLOWED_HOSTS — we
    pin it to 'localhost' (which is) for every request via the Client's
    `defaults`.
    """
    user = User.objects.get(email='galpartuk007@gmail.com')
    c = Client(HTTP_HOST='localhost')
    # force_login bypasses the password — we already verified password auth
    # works in the previous turn.
    c.force_login(user)
    return c


def stream_chat(c: Client, *, module: str, view_state: dict, messages: list) -> dict:
    """POST /api/ai/chat/, parse the SSE stream, return a structured summary."""
    res = c.post(
        '/api/ai/chat/',
        data=json.dumps({'module': module, 'view_state': view_state, 'messages': messages}),
        content_type='application/json',
    )
    assert res.status_code == 200, f'chat returned {res.status_code}: {res.content!r}'
    # `streaming_content` is a generator of bytes; consume it fully.
    body = b''.join(res.streaming_content) if hasattr(res, 'streaming_content') else res.content

    summary = {
        'text': [], 'tools_executed': [], 'proposals': [],
        'assistant_content': None, 'error': None, 'done_reason': None,
    }
    for event, data in parse_sse_body(body):
        if event == 'text':
            summary['text'].append(data.get('delta', ''))
        elif event == 'tool_running':
            summary['tools_executed'].append(data['name'])
        elif event == 'tool_proposal':
            summary['proposals'].extend(data.get('proposals', []))
            summary['assistant_content'] = data.get('assistant_content')
        elif event == 'error':
            summary['error'] = data.get('message')
        elif event == 'done':
            summary['done_reason'] = data.get('reason')
    summary['text'] = ''.join(summary['text'])
    return summary


def line(ch='='):
    print(ch * 72)


def fail(msg):
    print(f'\n[FAIL] {msg}')
    sys.exit(1)


def ok(msg):
    print(f'  [ok] {msg}')


# ── tests ────────────────────────────────────────────────────────────────

print('\n' + '#' * 72)
print('# AI agent integration test (Hebrew, end-to-end via HTTP layer)')
print('#' * 72)

c = login_client()
ok(f'logged in as {c.session.get("_auth_user_id")} (super_admin)')

TEST_NAME = 'בדיקת AI אוטומטית'
TEST_YEAR = '2028-2029'

# Ensure no leftover timetable with the same name from a previous failed run.
Timetable.objects.filter(name=TEST_NAME).delete()
ok('cleaned up any previous test timetables')


# ── FLOW 1: read-only, single tool ────────────────────────────────────────
print('\n' + '─' * 72)
print('FLOW 1: read-only Hebrew query — "מצא התנגשויות"')
print('─' * 72)

tt = Timetable.objects.order_by('-created_at').first()
if tt:
    s1 = stream_chat(c,
        module='timetable',
        view_state={'timetable_id': tt.id, 'timetable_name': tt.name},
        messages=[{'role': 'user', 'content': 'בדוק התנגשויות במערכת הנוכחית והצג רשימה.'}],
    )
    if s1['error']:
        fail(f'flow 1 error: {s1["error"]}')
    if 'find_conflicts' not in s1['tools_executed']:
        fail(f'expected find_conflicts in tools_executed, got {s1["tools_executed"]}')
    if s1['done_reason'] != 'complete':
        fail(f'expected done=complete, got {s1["done_reason"]}')
    if not any('֐' <= ch <= '׿' for ch in s1['text']):
        fail(f'expected Hebrew characters in response, got: {s1["text"][:100]!r}')
    ok(f'find_conflicts called inline; Hebrew response of {len(s1["text"])} chars')
else:
    print('  [skip] no timetable in DB')


# ── FLOW 2: Hebrew → mutating tool proposal → execute → verify DB ────────
print('\n' + '─' * 72)
print('FLOW 2: full create_timetable round trip in Hebrew')
print('─' * 72)

prompt_he = f'צור מערכת שעות חדשה לשנת {TEST_YEAR} בשם "{TEST_NAME}".'
print(f'  user > {prompt_he}')

s2 = stream_chat(c,
    module='timetable',
    view_state={},
    messages=[{'role': 'user', 'content': prompt_he}],
)

if s2['error']:
    fail(f'flow 2 chat error: {s2["error"]}')
if s2['done_reason'] != 'awaiting_confirmation':
    fail(f'expected awaiting_confirmation, got {s2["done_reason"]} (text: {s2["text"][:200]!r})')
if not s2['proposals']:
    fail(f'expected at least one tool_proposal, got none')

proposal = s2['proposals'][0]
if proposal['name'] != 'create_timetable':
    fail(f'expected create_timetable proposal, got {proposal["name"]}')
ok(f'tool_proposal received: {proposal["name"]} with input {proposal["input"]}')

# Verify the model picked up the right name + year from the Hebrew prompt.
if TEST_NAME not in str(proposal['input'].get('name', '')):
    fail(f'proposal name {proposal["input"].get("name")!r} does not match {TEST_NAME!r}')
if TEST_YEAR not in str(proposal['input'].get('academic_year', '')):
    fail(f'proposal year {proposal["input"].get("academic_year")!r} does not match {TEST_YEAR!r}')
ok('proposal input correctly extracted from Hebrew prompt')

# Now ACTUALLY execute the tool — same as clicking "Confirm" in the UI.
exec_res = c.post(
    '/api/ai/execute_tool/',
    data=json.dumps({
        'module': 'timetable',
        'view_state': {},
        'tool_name': proposal['name'],
        'tool_input': proposal['input'],
    }),
    content_type='application/json',
)
if exec_res.status_code != 200:
    fail(f'execute_tool returned {exec_res.status_code}: {exec_res.content!r}')
exec_data = exec_res.json()
if not exec_data.get('ok'):
    fail(f'execute_tool returned {exec_data}')
new_id = exec_data.get('timetable_id')
if not new_id:
    fail(f'execute_tool did not return timetable_id: {exec_data}')
ok(f'execute_tool ran; new Timetable.id = {new_id}')

# Verify in the actual database.
created = Timetable.objects.filter(id=new_id).first()
if created is None:
    fail(f'timetable {new_id} not present in DB after execute_tool')
if created.name != TEST_NAME:
    fail(f'created.name = {created.name!r}, expected {TEST_NAME!r}')
if created.academic_year != TEST_YEAR:
    fail(f'created.academic_year = {created.academic_year!r}, expected {TEST_YEAR!r}')
if created.status != Timetable.Status.DRAFT:
    fail(f'created.status = {created.status!r}, expected draft')
ok(f'DB row matches: name={created.name!r}, year={created.academic_year!r}, status={created.status!r}')

# Continue the conversation — feed the tool_result back so the model can wrap up.
# This validates the same multi-turn pattern the real frontend uses.
followup_messages = [
    {'role': 'user', 'content': prompt_he},
    {'role': 'assistant', 'content': s2['assistant_content']},
    {'role': 'user', 'content': [{
        'type': 'tool_result',
        'tool_use_id': proposal['id'],
        'content': json.dumps(exec_data, ensure_ascii=False),
    }]},
]
s3 = stream_chat(c, module='timetable', view_state={}, messages=followup_messages)
if s3['error']:
    fail(f'follow-up turn error: {s3["error"]}')
if s3['done_reason'] != 'complete':
    fail(f'expected follow-up done=complete, got {s3["done_reason"]}')
if not s3['text'].strip():
    fail('expected a wrap-up Hebrew message after tool_result, got empty')
ok(f'follow-up turn complete; assistant wrapped up with: "{s3["text"][:80]}..."')


# ── cleanup ──────────────────────────────────────────────────────────────
print('\n' + '─' * 72)
print('CLEANUP')
print('─' * 72)
deleted, _ = Timetable.objects.filter(name=TEST_NAME).delete()
ok(f'deleted {deleted} test timetable row(s)')

print('\n' + '#' * 72)
print('  ALL FLOWS PASSED')
print('#' * 72)
