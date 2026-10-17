import { inputClass, labelClass, buttonClass } from "@/lib/ui";

// A plain GET form: the PDF route reads from and to off the query string.
// Both are London days and both are included. Either may be left blank.
export default function ReportForm({ action, title = "PDF report" }) {
  return (
    <form action={action} method="get" target="_blank" className="hud rounded-md border border-line bg-panel p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`${action}-from`} className={labelClass}>From</label>
          <input id={`${action}-from`} type="date" name="from" className={inputClass} />
        </div>
        <div>
          <label htmlFor={`${action}-to`} className={labelClass}>To</label>
          <input id={`${action}-to`} type="date" name="to" className={inputClass} />
        </div>
        <button type="submit" className={buttonClass}>Download PDF</button>
      </div>
      <p className="mt-2 text-xs text-muted">Leave both blank for the whole history. Opens in a new tab, ready to print.</p>
    </form>
  );
}
