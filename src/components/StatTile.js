export default function StatTile({ label, children, sub }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="num mt-1 text-lg font-semibold">{children}</div>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
