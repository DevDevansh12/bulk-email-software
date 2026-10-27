/**
 * Incremental Server-Sent Events parser.
 *
 * Network chunks do not align with SSE event boundaries: one chunk can hold
 * half an event or several events. This parser buffers partial input and only
 * emits complete events (terminated by a blank line), per the SSE spec.
 */

export interface SseEvent {
  event: string; // defaults to "message" when no `event:` field is present
  data: string;
}

export interface SseParser {
  /** Feed decoded text; returns every event completed by this chunk. */
  push(chunk: string): SseEvent[];
  /** Call when the stream ends; returns a trailing event only if it was terminated. */
  flush(): SseEvent[];
}

export function createSseParser(): SseParser {
  let buffer = '';

  const parseBlock = (block: string): SseEvent | null => {
    let event = 'message';
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue; // blank or comment (heartbeat)
      const idx = line.indexOf(':');
      const field = idx === -1 ? line : line.slice(0, idx);
      let value = idx === -1 ? '' : line.slice(idx + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
    }

    if (dataLines.length === 0) return null;
    return { event, data: dataLines.join('\n') };
  };

  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk.replace(/\r\n?/g, '\n');
      const events: SseEvent[] = [];

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);
        if (parsed) events.push(parsed);
        boundary = buffer.indexOf('\n\n');
      }

      return events;
    },

    flush(): SseEvent[] {
      // An unterminated block is an incomplete event — the spec says discard it.
      buffer = '';
      return [];
    },
  };
}
