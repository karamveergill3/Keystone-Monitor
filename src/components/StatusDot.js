// Shape as well as colour, so the state reads without colour vision: a
// filled dot while syncing, a hollow ring when offline, a dashed ring while
// waiting for the first sync.
const STYLES = {
  online: ["bg-up shadow-[0_0_6px_rgb(15_108_72/0.45)]", "Syncing"],
  offline: ["border-2 border-down bg-transparent", "Offline"],
  waiting: ["border-2 border-dashed border-warn bg-transparent", "Waiting for first sync"],
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
