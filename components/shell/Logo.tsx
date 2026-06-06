// PNF placeholder mark (mockup SVG). Swap for official light/dark assets later (§14.8).
export function Logo({ className = 'logo' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--blue)" />
      <path
        d="M16 6.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm0 3.4a6.1 6.1 0 1 1 0 12.2 6.1 6.1 0 0 1 0-12.2Z"
        fill="#fff"
      />
      <circle cx="16" cy="16" r="2.6" fill="#fff" />
    </svg>
  );
}
