interface SwitchProps {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}

/** 36×20 switch from the design (amber background when on, cream knob). */
export function Switch({ on, label, disabled = false, onToggle }: SwitchProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors duration-200 ${
        on ? 'bg-accent' : 'bg-white/12'
      } ${disabled ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className="absolute top-[3px] size-3.5 rounded-full bg-cream transition-[left] duration-200"
        style={{ left: on ? 19 : 3 }}
      />
    </button>
  );
}
