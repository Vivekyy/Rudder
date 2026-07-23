import { readFileSync } from 'node:fs';

type JsonObject = Record<string, unknown>;

function jsonObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function contentText(content: unknown): string | null {
  if (typeof content === 'string') return content.trim() ? content : null;
  if (!Array.isArray(content)) return null;

  const parts = content.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item] : [];
    const block = jsonObject(item);
    if (
      !block ||
      (block.type !== 'text' && block.type !== 'output_text') ||
      typeof block.text !== 'string' ||
      !block.text.trim()
    ) {
      return [];
    }
    return [block.text];
  });

  return parts.length > 0 ? parts.join('\n\n') : null;
}

function assistantOutput(entry: unknown): string | null {
  const record = jsonObject(entry);
  if (!record) return null;

  const message = jsonObject(record.message);
  if (
    (record.type === 'assistant' || message?.role === 'assistant') &&
    message
  ) {
    const text = contentText(message.content);
    if (text) return text;
  }

  if (record.role === 'assistant') {
    const text = contentText(message?.content ?? record.content);
    if (text) return text;
  }

  const payload = jsonObject(record.payload);
  if (payload?.role === 'assistant') {
    const text = contentText(payload.content);
    if (text) return text;
  }

  if (payload?.type === 'agent_message' && typeof payload.message === 'string') {
    return payload.message.trim() ? payload.message : null;
  }

  return null;
}

/**
 * Read the latest visible assistant text from a coding-agent JSONL transcript.
 *
 * Transcripts are optional hook metadata, so missing, unreadable, partially
 * written, and unrecognized files all resolve to null.
 */
export function readPreviousAgentOutput(transcriptPath: string): string | null {
  let transcript: string;
  try {
    transcript = readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }

  const lines = transcript.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (!line.trim()) continue;

    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const output = assistantOutput(entry);
    if (output) return output;
  }

  return null;
}
