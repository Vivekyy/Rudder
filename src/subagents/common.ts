import type { MemoryRule } from '../rules.ts';

export function requiredString(value: unknown, field: string, max = 2_000): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`compiler output has no ${field}`);
  }
  return value.trim().slice(0, max);
}

export function parseObject(output: string, role: string): Record<string, unknown> {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error(`${role} returned no JSON object`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start, end + 1));
  } catch {
    throw new Error(`${role} returned invalid JSON`);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(`${role} output must be an object`);
  return parsed as Record<string, unknown>;
}

export function clipped(text: string | null | undefined, max = 8_000): string {
  return (text ?? '').slice(0, max);
}

export function serializedRules(active: readonly MemoryRule[]): object[] {
  return active.map((rule) => ({
    atomic_id: rule.atomic_id,
    version: rule.version,
    kind: rule.kind,
    scope: rule.scope,
    enforced: rule.enforced,
    project: rule.project,
    rule_text: rule.rule_text,
    applies_when: rule.applies_when,
    does_not_apply_when: rule.does_not_apply_when,
  }));
}
