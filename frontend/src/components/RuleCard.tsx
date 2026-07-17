import { faPen, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ActiveRule } from '../types';
import { EnforcementSlider } from './EnforcementSlider';

interface RuleCardProps {
  rule: ActiveRule;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleEnforced: (enforced: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function RuleCard({
  rule,
  expanded,
  onToggleExpanded,
  onToggleEnforced,
  onEdit,
  onDelete,
}: RuleCardProps) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggleExpanded}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleExpanded();
        }
      }}
      className="mb-2.5 cursor-pointer rounded-xl border border-[#232a33] bg-[#161b22] p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58a6ff]"
    >
      <div className="flex justify-between gap-3">
        <div className="font-semibold">{rule.rule_text}</div>
        <span className="text-[11px] tabular-nums text-[#58a6ff]">v{rule.version}</span>
      </div>

      {expanded ? (
        <div className="mt-3 border-t border-[#232a33] pt-3">
          <div className="mb-2 text-xs font-bold text-[#e6edf3]">Conditions</div>
          <div className="pl-3">
            <div className="text-xs text-[#8b949e]">
              <span className="font-semibold text-[#e6edf3]">When:</span> {rule.applies_when}
            </div>
            <div className="mt-1 text-xs text-[#8b949e]">
              <span className="font-semibold text-[#e6edf3]">Except:</span>{' '}
              {rule.does_not_apply_when}
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div onClick={(event) => event.stopPropagation()}>
              <div className="mb-2 text-xs font-bold text-[#e6edf3]">Enforcement</div>
              <div className="pl-3">
                <EnforcementSlider enforced={rule.enforced} onChange={onToggleEnforced} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Edit rule"
                title="Edit rule"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#232a33] bg-[#0f141b] text-xs text-[#e6edf3]"
              >
                <FontAwesomeIcon icon={faPen} />
              </button>
              <button
                type="button"
                aria-label="Delete rule"
                title="Delete rule"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#232a33] bg-[#0f141b] text-xs text-[#ff7b72]"
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
