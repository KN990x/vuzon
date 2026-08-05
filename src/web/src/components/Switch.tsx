interface SwitchProps {
  on: boolean;
  label: string;
  /** In flight: the control will come back. Shows the wait cursor. */
  busy?: boolean;
  /** Not operable at all (a rule the panel cannot edit). Shows the not-allowed cursor. */
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * 36×20 switch from the design (amber background when on, cream knob).
 *
 * `role="switch"` + `aria-checked`, not a plain button with `aria-pressed`: this is an
 * on/off control, and the switch role is what tells a screen reader to announce it as one.
 *
 * `busy` and `disabled` are separate because they were not: a single flag showed
 * `cursor-wait` for both, so a permanently non-editable rule displayed a wait cursor
 * forever, implying an operation that would never finish.
 */
export function Switch({ on, label, busy = false, disabled = false, onToggle }: SwitchProps) {
  const inert = busy || disabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={inert}
      onClick={onToggle}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors duration-200 ${
        on ? 'bg-accent' : 'bg-white/12'
      } ${inert ? 'opacity-60' : 'cursor-pointer'} ${busy ? 'cursor-wait' : ''} ${
        disabled && !busy ? 'cursor-not-allowed' : ''
      }`}
    >
      <span
        className="absolute top-[3px] size-3.5 rounded-full bg-cream transition-[left] duration-200"
        style={{ left: on ? 19 : 3 }}
      />
    </button>
  );
}
