interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteModal({ open, onClose, onConfirm }: DeleteModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-[#010409]/70 p-5">
      <div className="w-full max-w-[420px] rounded-2xl border border-[#232a33] bg-[#161b22] p-5 shadow-2xl">
        <h2 className="mb-3.5 text-base font-semibold">Delete rule?</h2>
        <div className="text-xs text-[#8b949e]">
          This will remove the active rule from Rudder. The old version stays in the local
          database history.
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#232a33] bg-[#0f141b] px-2.5 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className="rounded-lg border border-[#232a33] bg-[#0f141b] px-2.5 py-1.5 text-sm text-[#ff7b72]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
