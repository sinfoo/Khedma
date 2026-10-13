/**
 * Khedma mark: a Tunisian arched door (Sidi Bou Said blue) with a saffron knocker.
 * A door = the first job you are about to open.
 */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path d="M19 52V30a13 13 0 0 1 26 0v22" fill="none" stroke="var(--accent-ink)" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 17v35" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <circle cx="38" cy="38" r="3.6" fill="#f5b14c" />
    </svg>
  );
}

export function Wordmark({ className = "", size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Logo size={size} />
      <span className="display text-[1.2rem] leading-none tracking-tight">Khedma</span>
    </span>
  );
}
