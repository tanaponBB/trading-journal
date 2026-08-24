export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight ${className}`}>
      Pine<span className="text-ash">Ledger</span>
    </span>
  );
}
