"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";

/**
 * Tag input: Enter or comma adds, Backspace on empty removes the last one.
 * Autocomplete comes from a native <datalist>; optional one-click suggestions below.
 */
export function ChipInput({
  id,
  label,
  hint,
  values,
  onChange,
  suggestions = [],
  showSuggestions = false,
  placeholder,
  renderChip,
  max = 60,
}: {
  id: string;
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  showSuggestions?: boolean;
  placeholder?: string;
  renderChip?: (v: string) => React.ReactNode;
  max?: number;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());
  const add = (raw: string) => {
    const parts = raw.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    const next = [...values];
    for (const p of parts) {
      // Snap to the suggestion's spelling when it matches case-insensitively.
      const canon = suggestions.find((s) => s.toLowerCase() === p.toLowerCase()) ?? p;
      if (!next.some((x) => x.toLowerCase() === canon.toLowerCase())) next.push(canon.slice(0, 100));
    }
    if (next.length !== values.length) onChange(next.slice(0, max));
    setDraft("");
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));
  const open = suggestions.filter((s) => !has(s));

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="input flex !h-auto min-h-11 flex-wrap items-center gap-1.5 !py-1.5 focus-within:outline-2 focus-within:outline-[var(--ring)]">
        {values.length > 0 && (
          <ul className="contents" aria-label={label}>
            {values.map((v) => (
              <li key={v} className="chip chip-accent !py-0.5 !pr-0.5">
                <span className="max-w-[16rem] truncate">{v}</span>
                {renderChip?.(v)}
                <button
                  type="button"
                  className="grid size-6 place-items-center rounded-full hover:bg-surface"
                  aria-label={fmt(t.profile2.chips.remove, { x: v })}
                  onClick={() => remove(v)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id={id}
          list={suggestions.length ? `${id}-list` : undefined}
          className="min-w-[8rem] flex-1 bg-transparent py-1 outline-none"
          value={draft}
          placeholder={values.length ? undefined : placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            // Picking from the datalist fills the whole value: add it immediately.
            const kind = (e.nativeEvent as InputEvent).inputType;
            if ((kind === undefined || kind === "insertReplacementText") && suggestions.includes(v)) add(v);
            else if (/[,;]$/.test(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) add(draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              remove(values[values.length - 1]);
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
        />
        {suggestions.length > 0 && (
          <datalist id={`${id}-list`}>
            {open.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {showSuggestions && open.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${t.profile2.chips.suggestions}: ${label}`}>
          {open.slice(0, 10).map((s) => (
            <button key={s} type="button" className="chip min-h-7 cursor-pointer hover:!border-line-strong hover:!text-ink" onClick={() => add(s)}>
              <Plus size={12} aria-hidden="true" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
