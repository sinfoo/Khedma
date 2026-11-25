"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { addChips } from "./chips";

/**
 * Tag input: Enter or comma adds, a pasted list is split, Backspace on empty removes the last one.
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
  const c = t.profile2.chips;
  const [draft, setDraft] = useState("");
  // What just happened, for screen readers: chips appear and vanish without moving focus.
  const [said, setSaid] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());
  const add = (raw: string) => {
    const next = addChips(values, raw, suggestions, max);
    const added = next.slice(values.length);
    if (added.length) onChange(next);
    setSaid(added.length ? fmt(c.added, { x: added.join(", ") }) : values.length >= max ? fmt(c.full, { n: max }) : raw.trim() ? fmt(c.already, { x: raw.trim() }) : "");
    setDraft("");
  };
  const remove = (v: string) => {
    onChange(values.filter((x) => x !== v));
    setSaid(fmt(c.removed, { x: v }));
  };
  // A keyboard "click" (detail 0) removes the focused button: send focus to the field instead of losing it.
  // Mouse and touch keep their place, so the phone keyboard does not pop up on every tap.
  const refocus = (e: React.MouseEvent) => {
    if (e.detail === 0) input.current?.focus();
  };
  const open = suggestions.filter((s) => !has(s));

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {/* The whole box is the field: a tap beside the chips lands in the text input. */}
      <div
        className="input flex !h-auto min-h-11 cursor-text flex-wrap items-center gap-1.5 !py-1.5 focus-within:outline-2 focus-within:outline-[var(--ring)]"
        onClick={(e) => e.target === e.currentTarget && input.current?.focus()}
      >
        {values.length > 0 && (
          <ul className="contents" aria-label={label}>
            {values.map((v) => (
              <li key={v} className="chip chip-accent !py-0.5 !pr-0.5">
                <span className="max-w-[16rem] truncate">{v}</span>
                {renderChip?.(v)}
                <button
                  type="button"
                  className="relative grid size-6 place-items-center rounded-full after:absolute after:-inset-y-2 after:-right-1.5 after:left-0 after:content-[''] hover:bg-surface"
                  aria-label={fmt(c.remove, { x: v })}
                  onClick={(e) => {
                    remove(v);
                    refocus(e);
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={input}
          id={id}
          list={suggestions.length ? `${id}-list` : undefined}
          className="min-w-[8rem] flex-1 bg-transparent py-1 outline-none"
          value={draft}
          placeholder={values.length ? undefined : placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => {
            const v = e.target.value;
            // Picking from the datalist fills the whole value: add it immediately.
            const kind = (e.nativeEvent as InputEvent).inputType;
            if ((kind === undefined || kind === "insertReplacementText") && suggestions.includes(v)) add(v);
            else if (/[,;]$/.test(v)) add(v);
            else setDraft(v);
          }}
          onPaste={(e) => {
            // A pasted list becomes chips at once; a one-line field would glue its lines together.
            const text = e.clipboardData.getData("text");
            if (!/[,;\t\n]/.test(text)) return;
            e.preventDefault();
            add(draft + text);
          }}
          onKeyDown={(e) => {
            // Enter that confirms an IME candidate (Arabic, Japanese...) is not "add this chip".
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) add(draft);
            } else if (e.key === "Backspace" && !draft && values.length && !e.repeat) {
              // Not on key repeat: holding Backspace to clear the text must not eat the chips before it.
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
      <span className="sr-only" role="status">
        {said}
      </span>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {showSuggestions && open.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${c.suggestions}: ${label}`}>
          {open.slice(0, 10).map((s) => (
            <button
              key={s}
              type="button"
              className="chip min-h-7 cursor-pointer hover:!border-line-strong hover:!text-ink pointer-coarse:min-h-10 pointer-coarse:!px-3"
              onClick={(e) => {
                add(s);
                refocus(e);
              }}
            >
              <Plus size={12} aria-hidden="true" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
