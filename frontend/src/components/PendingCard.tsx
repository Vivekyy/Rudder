import type { PendingRule } from '../types';

interface PendingCardProps {
  item: PendingRule;
}

export function PendingCard({ item }: PendingCardProps) {
  return (
    <article className="mb-2.5 rounded-xl border border-[#232a33] bg-[#161b22] p-4">
      <div className="mb-2 flex justify-between gap-3">
        <span className="font-mono text-xs text-[#58a6ff]">#{item.id}</span>
        <span className="text-[11px] text-[#8b949e]">
          {item.source}
          {item.project ? ` \u00b7 ${item.project}` : ''}
        </span>
      </div>
      <div className="mb-2 overflow-anywhere font-semibold">
        {item.task_text || item.behavior_text || 'Queued prompt'}
      </div>
      <div className="text-xs text-[#8b949e]">
        {item.attempts ? `Attempts: ${item.attempts}` : 'Waiting for compilation'}
      </div>
    </article>
  );
}
