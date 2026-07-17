import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;

export interface TranscriptContext {
  lastUserText: string;
  lastAssistantText: string;
}

function entryRole(entry: Record<string, unknown>): 'user' | 'assistant' | null {
  const type = entry.type;
  if (type === 'user' || type === 'user.message') return 'user';
  if (type === 'assistant' || type === 'assistant.message') return 'assistant';
  if (type === 'response_item' && entry.payload && typeof entry.payload === 'object') {
    const role = (entry.payload as Record<string, unknown>).role;
    if (role === 'user' || role === 'assistant') return role;
  }
  return null;
}

function textBlocks(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const block = item as Record<string, unknown>;
      return ['text', 'input_text', 'output_text'].includes(String(block.type)) &&
        typeof block.text === 'string'
        ? [block.text]
        : [];
    })
    .join('\n');
}

function entryText(entry: Record<string, unknown>): string {
  for (const key of ['message', 'data', 'payload']) {
    const container = entry[key];
    if (container && typeof container === 'object') {
      const text = textBlocks((container as Record<string, unknown>).content);
      if (text) return text;
    }
  }
  return textBlocks(entry.content);
}

/**
 * Read only the bounded tail of a Claude/Codex JSONL transcript. Transcript
 * formats are not stable APIs, so malformed and unknown records are ignored.
 */
export function readTranscriptContext(path: string | null | undefined): TranscriptContext {
  const empty = { lastUserText: '', lastAssistantText: '' };
  if (!path) return empty;

  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - MAX_TRANSCRIPT_BYTES);
    const buffer = Buffer.alloc(size - start);
    readSync(fd, buffer, 0, buffer.length, start);

    let text = buffer.toString('utf8');
    if (start > 0) {
      const newline = text.indexOf('\n');
      text = newline === -1 ? '' : text.slice(newline + 1);
    }

    let lastUserText = '';
    let lastAssistantText = '';
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const role = entryRole(entry);
      const content = entryText(entry).trim();
      if (!content) continue;
      if (role === 'user') lastUserText = content;
      if (role === 'assistant') lastAssistantText = content;
    }
    return { lastUserText, lastAssistantText };
  } catch {
    return empty;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
