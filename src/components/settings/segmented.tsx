"use client";

/** Segmented control on native radio inputs (arrow keys, labels and focus come for free). */
export function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  name: string;
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <fieldset aria-describedby={hintId} disabled={disabled}>
      <legend className="label">{legend}</legend>
      <div className={`grid gap-1 rounded-xl border border-line bg-surface-2 p-1 ${options.length === 4 ? "grid-cols-2 sm:grid-cols-4" : options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-3 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)] ${
              value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="hint" aria-live="polite">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
