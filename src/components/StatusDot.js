// The sync state by shape alone: a filled dot while syncing, a hollow ring
// when offline, a dashed ring while waiting for the first sync. All three
// are one neutral colour, so none reads as a warning or as good news: the
// site's only highlight is a basket that can be closed in profit
// (src/lib/attention.js).
const STYLES = {
  online: ["bg-muted", "Syncing"],
  offline: ["border-2 border-muted bg-transparent", "Offline"],
  waiting: ["border-2 border-dashed border-muted bg-transparent", "Waiting for first sync"],
};

export default function StatusDot({ status, title }) {
  const [style, label] = STYLES[status] ?? STYLES.waiting;
  return (
    <span className="relative inline-flex items-center gap-1.5" title={title ?? label}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${style}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
