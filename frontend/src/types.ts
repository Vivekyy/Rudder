export interface ActiveRule {
  id: number;
  atomic_id: string;
  version: number;
  status: 'active' | 'inactive';
  kind: 'preference' | 'pitfall';
  scope: 'global' | 'project';
  enforced: boolean;
  project: string | null;
  rule_text: string;
  applies_when: string;
  does_not_apply_when: string;
  source_prompt_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PendingRule {
  id: number;
  ts: string;
  source: 'claude' | 'codex';
  project: string | null;
  task_text: string | null;
  behavior_text: string | null;
  attempts: number;
}

export interface RuleState {
  active_rules: ActiveRule[];
  pending_prompts: number;
  pending_rules: PendingRule[];
}

export interface RuleFormInput {
  ruleText: string;
  appliesWhen: string;
  doesNotApplyWhen: string;
  enforced: boolean;
}
