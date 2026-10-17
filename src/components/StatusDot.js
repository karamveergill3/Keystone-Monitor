const STYLES = {
  online: ["bg-up", "Syncing"],
  offline: ["bg-down", "Offline"],
  waiting: ["bg-warn", "Waiting for first sync"],
};

export default function StatusDot({ status, title }) {
  const [colour, label] = STYLES[status] ?? STYLES.waiting;
  return (
    <span className="relative inline-flex items-center gap-1.5" title={title ?? label}>
      <span className={`inline-block h-2 w-2 rounded-full ${colour}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
