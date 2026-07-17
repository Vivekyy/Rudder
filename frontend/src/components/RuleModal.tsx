import { useEffect, useState } from 'react';
import type { ActiveRule, RuleFormInput } from '../types';
import { EnforcementSlider } from './EnforcementSlider';

interface RuleModalProps {
  rule: ActiveRule | null;
  open: boolean;
  onClose: () => void;
  onSave: (input: RuleFormInput) => Promise<void>;
}

const emptyForm: RuleFormInput = {
  ruleText: '',
  appliesWhen: '',
  doesNotApplyWhen: '',
  enforced: false,
};

export function RuleModal({ rule, open, onClose, onSave }: RuleModalProps) {
  const [form, setForm] = useState<RuleFormInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(
      rule
        ? {
            ruleText: rule.rule_text,
            appliesWhen: rule.applies_when,
            doesNotApplyWhen: rule.does_not_apply_when,
            enforced: rule.enforced,
          }
        : emptyForm
    );
  }, [rule, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-[#010409]/70 p-5">
      <form
        className="w-full max-w-[460px] rounded-2xl border border-[#232a33] bg-[#161b22] p-5 shadow-2xl"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await onSave(form);
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="mb-3 grid gap-1.5 text-xs text-[#8b949e]">
          Rule Text
          <textarea
            required
            value={form.ruleText}
            placeholder={'The rule you want your coding agent to follow (i.e. "Avoid writing inline comments")'}
            onChange={(event) => setForm({ ...form, ruleText: event.currentTarget.value })}
            className="min-h-20 rounded-lg border border-[#232a33] bg-[#0e1116] px-2.5 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#58a6ff]"
          />
        </label>
        <label className="mb-3 grid gap-1.5 text-xs text-[#8b949e]">
          When
          <textarea
            required
            value={form.appliesWhen}
            placeholder={'When you want the rule to apply (i.e. "When working with Typescript")'}
            onChange={(event) => setForm({ ...form, appliesWhen: event.currentTarget.value })}
            className="min-h-20 rounded-lg border border-[#232a33] bg-[#0e1116] px-2.5 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#58a6ff]"
          />
        </label>
        <label className="mb-3 grid gap-1.5 text-xs text-[#8b949e]">
          Except
          <textarea
            required
            value={form.doesNotApplyWhen}
            placeholder={'When you don\'t want the rule to apply (i.e. "When writing frontend code")'}
            onChange={(event) =>
              setForm({ ...form, doesNotApplyWhen: event.currentTarget.value })
            }
            className="min-h-20 rounded-lg border border-[#232a33] bg-[#0e1116] px-2.5 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#58a6ff]"
          />
        </label>
        <EnforcementSlider
          enforced={form.enforced}
          onChange={(enforced) => setForm({ ...form, enforced })}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#232a33] bg-[#0f141b] px-2.5 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border border-[#232a33] bg-[#0f141b] px-2.5 py-1.5 text-sm disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
