/** App title. Always full-contrast — it is the one thing that should never look muted. */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight text-chalk ${className}`}>
      Pine<span className="font-normal">Ledger</span>
    </span>
  );
}
