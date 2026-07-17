import type { RuleFormInput, RuleState } from './types';

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data as T;
}

export function fetchRules(): Promise<RuleState> {
  return jsonRequest<RuleState>('/api/rules');
}

export function createRule(input: RuleFormInput): Promise<RuleState> {
  return jsonRequest<RuleState>('/api/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateRule(id: number, input: RuleFormInput): Promise<RuleState> {
  return jsonRequest<RuleState>(`/api/rules/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function setRuleEnforced(id: number, enforced: boolean): Promise<RuleState> {
  return jsonRequest<RuleState>(`/api/rules/${id}/enforced`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enforced }),
  });
}

export function deleteRule(id: number): Promise<RuleState> {
  return jsonRequest<RuleState>(`/api/rules/${id}`, { method: 'DELETE' });
}

export function subscribeRules(onState: (state: RuleState) => void, onError: () => void): EventSource {
  const source = new EventSource('/events');
  source.onmessage = (event) => {
    try {
      onState(JSON.parse(event.data) as RuleState);
    } catch {
      // Ignore malformed events and keep the stream alive.
    }
  };
  source.onerror = onError;
  return source;
}
