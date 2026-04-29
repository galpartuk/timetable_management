import type { StreamEvent } from './types';

/**
 * POST a JSON body and consume the SSE response. We can't use the browser's
 * EventSource (it's GET-only), so we fetch + manually parse the SSE frames.
 *
 * Each callback gets a typed event. Parser keeps a buffer because chunks can
 * split mid-frame; SSE frames are separated by blank lines.
 */
export async function streamChat(
  url: string,
  body: any,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const csrf = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='))
    ?.split('=')[1];

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRFToken': csrf } : {}),
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch { /* not JSON, ignore */ }
    onEvent({ type: 'error', message });
    onEvent({ type: 'done', reason: 'error' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sepIdx;
    while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sepIdx);
      buf = buf.slice(sepIdx + 2);
      const event = parseFrame(frame);
      if (event) onEvent(event);
    }
  }
}

function parseFrame(frame: string): StreamEvent | null {
  let eventName = 'message';
  const dataLines: string[] = [];
  for (const raw of frame.split('\n')) {
    const line = raw.trimEnd();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  let data: any;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }
  // Re-shape to our discriminated union
  switch (eventName) {
    case 'text': return { type: 'text', delta: data.delta };
    case 'tool_running': return { type: 'tool_running', name: data.name, input: data.input };
    case 'tool_result': return { type: 'tool_result', name: data.name, result: data.result };
    case 'tool_proposal': return { type: 'tool_proposal', proposals: data.proposals, assistant_content: data.assistant_content };
    case 'error': return { type: 'error', message: data.message };
    case 'done': return { type: 'done', reason: data.reason };
    default: return null;
  }
}
