interface EnforcementSliderProps {
  enforced: boolean;
  onChange: (enforced: boolean) => void;
}

export function EnforcementSlider({ enforced, onChange }: EnforcementSliderProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Rule enforcement"
      className="relative grid w-48 grid-cols-2 rounded-lg border border-[#232a33] bg-[#0f141b] p-1 font-mono text-[10px] font-semibold uppercase tracking-wide"
    >
      <span
        className={[
          'pointer-events-none absolute inset-y-1 w-[calc(50%_-_0.25rem)] rounded-md bg-[#58a6ff] transition-[left]',
          enforced ? 'left-1/2' : 'left-1',
        ].join(' ')}
      />
      <button
        type="button"
        role="radio"
        aria-checked={!enforced}
        onClick={() => {
          if (enforced) onChange(false);
        }}
        className={[
          'relative z-10 rounded-md px-3.5 py-2 text-center transition-colors',
          enforced ? 'text-[#8b949e]' : 'text-[#06131f]',
        ].join(' ')}
      >
        Preference
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={enforced}
        onClick={() => {
          if (!enforced) onChange(true);
        }}
        className={[
          'relative z-10 rounded-md px-3.5 py-2 text-center transition-colors',
          enforced ? 'text-[#06131f]' : 'text-[#8b949e]',
        ].join(' ')}
      >
        Rule
      </button>
    </div>
  );
}
