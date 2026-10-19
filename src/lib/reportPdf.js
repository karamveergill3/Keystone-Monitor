// The PDF reports, drawn with pdfkit.
//
// The standalone build carries the standard fonts inside the bundle, so
// nothing has to be read from disk at runtime, which is what breaks the
// regular build inside a serverless function.
//
// Light, because these are for paper.

import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { money, pct, number, dayLabel, monthLabel, londonTime } from "./format.js";
import { daysInclusive } from "./days.js";
import { APP_NAME } from "./site.js";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
const M = 40;

// The width between the margins and the lowest a row may reach, from the
// page itself, so the same helpers lay out portrait and landscape.
function colW(doc) {
  return doc.page.width - M * 2;
}

function bottomOf(doc) {
  return doc.page.height - M - 24;
}

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const PANEL = "#f6f7f9";
const UP = "#15803d";
const DOWN = "#b91c1c";
const ACCENT = "#2f5bd3";

// The standard PDF fonts only cover Latin-1 (plus the euro sign), so the
// few characters Intl can produce outside that are mapped down.
export function pdfText(value) {
  return String(value ?? "")
    .replace(/[−‒–—]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/[^\u0000-ÿ€]/g, "?");
}

function render(draw, { layout = "portrait", footer = true } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout, margin: M, bufferPages: true, info: { Producer: APP_NAME, Creator: APP_NAME } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))))));
    doc.on("error", reject);
    try {
      draw(doc);
      if (footer) footers(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function footers(doc) {
  const COL = colW(doc);
  const { start, count } = doc.bufferedPageRange();
  const stamp = `Generated ${londonTime(new Date().toISOString())} London time`;
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7).fillColor(MUTED);
    doc.text(pdfText(`${APP_NAME} · ${stamp}`), M, doc.page.height - M + 8, { width: COL / 2, lineBreak: false });
    doc.text(`Page ${i - start + 1} of ${count}`, M + COL / 2, doc.page.height - M + 8, { width: COL / 2, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > bottomOf(doc)) doc.addPage();
}

function periodLine(range, firstDay) {
  if (range.from) {
    const n = daysInclusive(range.from, range.to);
    return `Period: ${dayLabel(range.from)} to ${dayLabel(range.to)} · ${n} ${n === 1 ? "day" : "days"}`;
  }
  return firstDay ? `Period: whole history, ${dayLabel(firstDay)} to ${dayLabel(range.to)}` : `Period: whole history to ${dayLabel(range.to)}`;
}

function header(doc, { eyebrow, title, lines }) {
  const COL = colW(doc);
  if (eyebrow) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT).text(pdfText(eyebrow.toUpperCase()), M, M, { characterSpacing: 1 });
    doc.moveDown(0.3);
  } else {
    doc.y = M;
  }
  doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text(pdfText(title), M, doc.y);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  for (const l of lines) if (l) doc.text(pdfText(l));
  doc.moveDown(0.8);
  doc.moveTo(M, doc.y).lineTo(M + COL, doc.y).strokeColor(LINE).lineWidth(1).stroke();
  doc.moveDown(0.8);
}

// keepWith is room for what follows, so a title is never left alone at the
// foot of a page: a table's header and first rows by default.
function sectionTitle(doc, text, keepWith = 60) {
  ensureSpace(doc, 30 + keepWith);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(pdfText(text), M, doc.y);
  doc.moveDown(0.4);
}

// A grid of labelled figures, four to a row.
function figures(doc, items) {
  const COL = colW(doc);
  const perRow = 4;
  const gap = 8;
  const w = (COL - gap * (perRow - 1)) / perRow;
  const h = 44;
  for (let i = 0; i < items.length; i += perRow) {
    ensureSpace(doc, h + gap);
    const y = doc.y;
    items.slice(i, i + perRow).forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.roundedRect(x, y, w, h, 4).fillColor(PANEL).fill();
      doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(pdfText(it.label), x + 8, y + 7, { width: w - 16, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(11).fillColor(it.tone ?? INK).text(pdfText(it.value), x + 8, y + 19, { width: w - 16, lineBreak: false });
      if (it.sub) doc.font("Helvetica").fontSize(6.5).fillColor(MUTED).text(pdfText(it.sub), x + 8, y + 33, { width: w - 16, lineBreak: false });
    });
    doc.y = y + h + gap;
    doc.x = M;
  }
}

function toneOf(v) {
  return v > 0 ? UP : v < 0 ? DOWN : INK;
}

// Closing balance by day, as a simple line.
const CURVE_H = 150;

function curve(doc, points, currency) {
  const COL = colW(doc);
  const h = CURVE_H;
  ensureSpace(doc, h + 20);
  const x0 = M;
  const y0 = doc.y;
  doc.rect(x0, y0, COL, h).fillColor(PANEL).fill();
  if (points.length < 2) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Not enough days with deals to draw a curve.", x0, y0 + h / 2 - 4, { width: COL, align: "center" });
    doc.y = y0 + h + 10;
    return;
  }
  const vals = points.map((p) => p.balance);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const padL = 64, padR = 10, padT = 10, padB = 18;
  const w = COL - padL - padR;
  const ih = h - padT - padB;
  const px = (i) => x0 + padL + (i / (points.length - 1)) * w;
  const py = (v) => y0 + padT + (1 - (v - lo) / (hi - lo)) * ih;

  doc.font("Helvetica").fontSize(6.5).fillColor(MUTED);
  for (const v of [hi, (hi + lo) / 2, lo]) {
    doc.moveTo(x0 + padL, py(v)).lineTo(x0 + padL + w, py(v)).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.text(pdfText(money(v, currency, { decimals: 0 })), x0 + 4, py(v) - 3, { width: padL - 8, align: "right", lineBreak: false });
  }
  doc.text(pdfText(dayLabel(points[0].day)), x0 + padL, y0 + h - 12, { lineBreak: false });
  doc.text(pdfText(dayLabel(points[points.length - 1].day)), x0 + padL, y0 + h - 12, { width: w, align: "right", lineBreak: false });

  doc.moveTo(px(0), py(vals[0]));
  for (let i = 1; i < vals.length; i++) doc.lineTo(px(i), py(vals[i]));
  doc.strokeColor(ACCENT).lineWidth(1.2).stroke();
  doc.y = y0 + h + 10;
  doc.x = M;
}

// A table that carries on across pages, repeating its header.
function table(doc, columns, rows, { fontSize = 8 } = {}) {
  const COL = colW(doc);
  const rowH = fontSize + 7;
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const scale = COL / totalW;
  const cols = columns.map((c) => ({ ...c, width: c.width * scale }));

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(M, y, COL, rowH).fillColor(PANEL).fill();
    let x = M;
    doc.font("Helvetica-Bold").fontSize(fontSize - 0.5).fillColor(MUTED);
    for (const c of cols) {
      doc.text(pdfText(c.label), x + 4, y + 4, { width: c.width - 8, align: c.align ?? "left", lineBreak: false });
      x += c.width;
    }
    doc.y = y + rowH;
  };

  ensureSpace(doc, rowH * 3);
  drawHeader();
  for (const r of rows) {
    if (doc.y + rowH > bottomOf(doc)) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    let x = M;
    r.forEach((cell, i) => {
      const c = cols[i];
      const value = typeof cell === "object" && cell !== null ? cell : { text: cell };
      doc.font(value.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      doc.fillColor(value.tone ?? INK).text(pdfText(value.text), x + 4, y + 4, { width: c.width - 8, align: c.align ?? "left", lineBreak: false });
      x += c.width;
    });
    doc.moveTo(M, y + rowH).lineTo(M + COL, y + rowH).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.y = y + rowH;
  }
  doc.x = M;
  doc.moveDown(0.5);
}

function signed(v, currency) {
  return { text: money(v, currency, { sign: true }), tone: toneOf(v) };
}

// ------------------------------------------------------------------ account

export function accountReportPdf(model) {
  const { account: a, project, range, summary: s, months, curve: points, positions } = model;
  const c = a.currency;
  return render((doc) => {
    header(doc, {
      eyebrow: `${APP_NAME} · ${project?.name ?? ""} account report`,
      title: a.label,
      lines: [
        a.account_number ? `MT5 ${a.account_number} · ${a.server}${a.broker ? ` · ${a.broker}` : ""} · ${c}` : "Not connected yet",
        periodLine(range, points[0]?.day),
      ],
    });

    figures(doc, [
      { label: "Starting balance", value: money(s.startBalance, c) },
      { label: "Closing balance", value: money(s.endBalance, c) },
      { label: "Trading P&L", value: money(s.tradePnl, c, { sign: true }), tone: toneOf(s.tradePnl) },
      { label: "Gain", value: pct(s.gain, { sign: true }), tone: toneOf(s.gain), sub: "Time-weighted" },
      { label: "Deposits", value: money(s.deposits, c) },
      { label: "Withdrawals", value: money(s.withdrawals, c) },
      { label: "Max drawdown", value: pct(s.maxDrawdown), sub: "Day-end, in this period" },
      {
        label: "Max equity drawdown",
        value: pct(a.maxDd),
        sub: a.tracking_since ? `Since ${dayLabel(a.tracking_since.slice(0, 10))}, not limited to period` : "Not tracked yet",
      },
      { label: "Trades closed", value: s.closed.toLocaleString("en-GB") },
      { label: "Win rate", value: pct(s.winRate, { decimals: 1 }) },
      { label: "Profit factor", value: s.profitFactor === null ? "-" : number(s.profitFactor, 2) },
      { label: "Lots closed", value: number(s.lots, 2) },
      { label: "Best day", value: s.bestDay ? money(s.bestDay.pnl, c, { sign: true }) : "-", sub: s.bestDay ? dayLabel(s.bestDay.day) : null, tone: s.bestDay ? toneOf(s.bestDay.pnl) : INK },
      { label: "Worst day", value: s.worstDay ? money(s.worstDay.pnl, c, { sign: true }) : "-", sub: s.worstDay ? dayLabel(s.worstDay.day) : null, tone: s.worstDay ? toneOf(s.worstDay.pnl) : INK },
      { label: "Trading days", value: String(s.tradingDays) },
      { label: "Balance now", value: money(a.balance, c), sub: a.last_sync_at ? `Synced ${londonTime(a.last_sync_at)}` : null },
    ]);

    sectionTitle(doc, "Closing balance", CURVE_H + 20);
    curve(doc, points, c);

    sectionTitle(doc, "By month");
    if (months.length) {
      table(
        doc,
        [
          { label: "Month", width: 90 },
          { label: "Trading P&L", width: 90, align: "right" },
          { label: "Gain", width: 60, align: "right" },
          { label: "Trades", width: 50, align: "right" },
          { label: "Deposits / withdrawals", width: 110, align: "right" },
          { label: "Closing balance", width: 100, align: "right" },
        ],
        months.map((m) => [
          monthLabel(m.key),
          signed(m.pnl, c),
          { text: pct(m.gain, { sign: true }), tone: toneOf(m.gain) },
          String(m.closed),
          m.cashFlow ? money(m.cashFlow, c, { sign: true }) : "-",
          money(m.endBalance, c),
        ])
      );
    } else {
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("No deals in this period.");
    }

    sectionTitle(doc, positions.total > positions.rows.length
      ? `Closed trades, newest ${positions.rows.length} of ${positions.total.toLocaleString("en-GB")}`
      : `Closed trades (${positions.total.toLocaleString("en-GB")})`);
    if (positions.rows.length) {
      table(
        doc,
        [
          { label: "Closed (London)", width: 105 },
          { label: "Symbol", width: 70 },
          { label: "Side", width: 40 },
          { label: "Lots", width: 45, align: "right" },
          { label: "Open", width: 70, align: "right" },
          { label: "Close", width: 70, align: "right" },
          { label: "Net", width: 80, align: "right" },
        ],
        positions.rows.map((p) => [
          londonTime(p.close_time),
          p.symbol ?? "",
          p.side ?? "",
          number(p.volume_out, 2),
          p.open_price === null ? "-" : number(p.open_price, 5),
          p.close_price === null ? "-" : number(p.close_price, 5),
          signed(Number(p.net), c),
        ]),
        { fontSize: 7.5 }
      );
    } else {
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("No trades closed in this period.");
    }
  });
}

// ------------------------------------------------------------------ project

export function projectReportPdf(model) {
  const { project, range, rows, totals } = model;
  return render((doc) => {
    const COL = colW(doc);
    header(doc, {
      eyebrow: `${APP_NAME} · project report`,
      title: project.name,
      lines: [`${rows.length} ${rows.length === 1 ? "account" : "accounts"}`, periodLine(range)],
    });

    for (const t of totals) {
      figures(doc, [
        { label: `Accounts in ${t.currency}`, value: String(t.accounts) },
        { label: "Starting balance", value: money(t.startBalance, t.currency, { decimals: 0 }) },
        { label: "Closing balance", value: money(t.endBalance, t.currency, { decimals: 0 }) },
        { label: "Trading P&L", value: money(t.tradePnl, t.currency, { sign: true, decimals: 0 }), tone: toneOf(t.tradePnl) },
      ]);
    }

    sectionTitle(doc, "Accounts");
    table(
      doc,
      [
        { label: "Account", width: 120 },
        { label: "Start", width: 70, align: "right" },
        { label: "End", width: 70, align: "right" },
        { label: "In / out", width: 65, align: "right" },
        { label: "Trading P&L", width: 75, align: "right" },
        { label: "Gain", width: 50, align: "right" },
        { label: "Max DD", width: 45, align: "right" },
        { label: "Trades", width: 40, align: "right" },
      ],
      rows.map((r) => {
        if (r.balance === null) return [`${r.label} (not connected)`, "-", "-", "-", "-", "-", "-", "-"];
        const s = r.summary;
        const c = r.currency;
        const flow = s.deposits + s.withdrawals;
        return [
          r.label,
          money(s.startBalance, c, { decimals: 0 }),
          money(s.endBalance, c, { decimals: 0 }),
          flow ? money(flow, c, { sign: true, decimals: 0 }) : "-",
          { text: money(s.tradePnl, c, { sign: true, decimals: 0 }), tone: toneOf(s.tradePnl) },
          { text: pct(s.gain, { sign: true }), tone: toneOf(s.gain) },
          pct(s.maxDrawdown),
          String(s.closed),
        ];
      }),
      { fontSize: 7.5 }
    );
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(
      "Gain is time-weighted, so deposits and withdrawals do not move it. Max DD is the largest day-end fall in the period. Accounts in different currencies are totalled separately.",
      M,
      doc.y,
      { width: COL }
    );
  });
}

// ------------------------------------------------------------------ fleet

// The fleet summary's own palette: soft panels, a muted green and red for
// the headline figures, the accent for counts.
const SOFT = "#f4f6fa";
const BODY = "#475569";
const SLATE = "#64748b";
const GOOD = "#2e7d4f";
const BAD = "#b23b3b";
const AREA = "#dbe3f7";
const GRID = "#e3e7ef";

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function listJoin(items) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Letter-spaced capitals, as the summary's small headings are set.
function spaced(doc, text, x, y, { size = 7.5, color = SLATE, spacing = 2, align = "left", width = 0 } = {}) {
  const t = pdfText(text.toUpperCase());
  doc.font("Helvetica-Bold").fontSize(size).fillColor(color);
  const w = doc.widthOfString(t, { characterSpacing: spacing });
  const at = align === "right" ? x + width - w : align === "center" ? x + (width - w) / 2 : x;
  doc.text(t, at, y, { characterSpacing: spacing, lineBreak: false });
  return w;
}

function softPanel(doc, x, y, w, h, { bar = false } = {}) {
  doc.roundedRect(x, y, w, h, 6).fillColor(SOFT).fill();
  if (bar) doc.rect(x, y, 3, h).fillColor(ACCENT).fill();
}

// Cumulative realised profit, a step for each trading day, filled down to
// zero. y ticks split the range evenly, as the printed summary has always
// had them: five, or three on a short chart.
function profitChart(doc, x, y, w, h, curve, currency, today) {
  softPanel(doc, x, y, w, h);
  const left = x + 62, right = x + w - 16, top = y + 16, bottom = y + h - 26;

  doc.save();
  doc.rotate(-90, { origin: [x + 14, (top + bottom) / 2] });
  doc.font("Helvetica").fontSize(6.5).fillColor(SLATE);
  const label = pdfText(`NET PROFIT (${currency})`);
  doc.text(label, x + 14 - doc.widthOfString(label) / 2, (top + bottom) / 2 - 3, { lineBreak: false });
  doc.restore();

  if (!curve.length) {
    doc.moveTo(left, bottom).lineTo(right, bottom).strokeColor(GRID).lineWidth(0.6).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(SLATE).text("0", x + 20, bottom - 3, { width: left - x - 26, align: "right", lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(SLATE).text("No closed trades yet.", left, (top + bottom) / 2 - 4, { width: right - left, align: "center", lineBreak: false });
    return;
  }

  const values = curve.map((c) => c.value);
  const hi = Math.max(0, ...values);
  let lo = Math.min(0, ...values);
  // A dip of a few dollars at the start would put "-38" at the foot of
  // the scale: under 2% of the range, the scale starts at 0 instead.
  if (lo < 0 && -lo <= 0.02 * (hi - lo)) lo = 0;
  const span = hi - lo || 1;
  const yOf = (v) => Math.min(bottom, Math.max(top, bottom - ((v - lo) / span) * (bottom - top)));

  const steps = bottom - top < 60 ? 2 : 4;
  const decimals = span / steps >= 1 ? 0 : 2;
  doc.font("Helvetica").fontSize(7);
  for (let k = 0; k <= steps; k++) {
    const v = lo + (span * k) / steps;
    const gy = yOf(v);
    doc.moveTo(left, gy).lineTo(right, gy).strokeColor(GRID).lineWidth(0.6).stroke();
    doc.fillColor(SLATE).text(number(decimals ? v : Math.round(v), decimals), x + 20, gy - 3, { width: left - x - 26, align: "right", lineBreak: false });
  }

  const lastDay = today > curve[curve.length - 1].day ? today : curve[curve.length - 1].day;
  const first = Date.parse(`${curve[0].day}T00:00:00Z`);
  const last = Date.parse(`${lastDay}T00:00:00Z`);
  const xOf = (day) => (last === first ? right : left + ((Date.parse(`${day}T00:00:00Z`) - first) / (last - first)) * (right - left));

  // A step at each day: flat until the day, then up or down by its P&L.
  const pts = [[left, yOf(0)]];
  let prev = 0;
  for (const c of curve) {
    const cx = xOf(c.day);
    pts.push([cx, yOf(prev)], [cx, yOf(c.value)]);
    prev = c.value;
  }
  pts.push([right, yOf(prev)]);

  doc.moveTo(left, yOf(0));
  for (const [px, py] of pts) doc.lineTo(px, py);
  doc.lineTo(right, yOf(0)).closePath().fillColor(AREA).fill();
  doc.moveTo(pts[0][0], pts[0][1]);
  for (const [px, py] of pts.slice(1)) doc.lineTo(px, py);
  doc.strokeColor(ACCENT).lineWidth(1.2).lineJoin("round").stroke();

  const short = (key) => pdfText(dayLabel(key).replace(/\s+\d{4}$/, ""));
  doc.font("Helvetica").fontSize(7).fillColor(SLATE);
  doc.text(short(curve[0].day), left, bottom + 7, { lineBreak: false });
  if (lastDay !== curve[0].day) {
    const end = short(lastDay);
    doc.text(end, right - doc.widthOfString(end), bottom + 7, { lineBreak: false });
  }
}

function statCard(doc, x, y, w, h, value, label, tone) {
  softPanel(doc, x, y, w, h);
  doc.font("Helvetica-Bold").fontSize(16).fillColor(tone);
  doc.text(pdfText(value), x, y + h / 2 - 13, { width: w, align: "center", lineBreak: false });
  spaced(doc, label, x, y + h / 2 + 9, { size: 6.5, width: w, align: "center", spacing: 1.6 });
}

const NOTE = 8;

// A paragraph led by a bold accent phrase.
function lead(doc, x, y, w, head, body) {
  doc.font("Helvetica-Bold").fontSize(NOTE).fillColor(ACCENT).text(pdfText(`${head} `), x, y, { width: w, continued: true, lineGap: 1.5 });
  doc.font("Helvetica").fillColor(BODY).text(pdfText(body), { width: w, lineGap: 1.5 });
}

// Its height: the whole paragraph in the regular face, in a width cut by
// however much wider the bold lead-in is, so it is never short.
function heightOfLead(doc, w, head, body) {
  const lead = pdfText(`${head} `);
  doc.font("Helvetica-Bold").fontSize(NOTE);
  const bold = doc.widthOfString(lead);
  doc.font("Helvetica").fontSize(NOTE);
  const extra = Math.max(0, bold - doc.widthOfString(lead));
  return doc.heightOfString(pdfText(`${head} ${body}`), { width: w - extra - 1, lineGap: 1.5 });
}

// The words of the summary, for a given amount of room: tight = 0 is the
// full text; each step up drops something optional, in this order.
function fleetWords(m, tight) {
  const c = m.currency;
  const live = plural(m.accounts, "live account");
  const names = m.algorithms.map((a) => a.name);
  const shownNames = tight >= 2 && names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names;

  const purpose = names.length
    ? `Show how ${listJoin(shownNames)} ${names.length === 1 ? "has" : "have"} performed on every live-tracked account, aggregated since each account went live, alongside the floating drawdown carried along the way.`
    : "Show how every live-tracked account has performed, aggregated since each account went live, alongside the floating drawdown carried along the way.";

  const headline = names.length
    ? `${plural(names.length, "algorithm")} across ${live}, each synced live from its own MT5 terminal.`
    : "Each account is synced live from its own MT5 terminal.";
  const shown = tight >= 3 ? 3 : 5;
  const listed = m.algorithms.length > shown ? m.algorithms.slice(0, shown - 1) : m.algorithms;
  const bullets = listed.map((a) =>
    `${a.name}: ${plural(a.accounts, "account")} · ${number(a.trades, 0)} trades · ${money(a.profit, c, { sign: true })} realised${a.winRate === null ? "" : ` · ${pct(a.winRate, { decimals: 1 })} win rate`}.`
  );
  if (m.algorithms.length > listed.length) {
    const more = m.algorithms.slice(listed.length);
    bullets.push(`Also ${listJoin(more.map((a) => (tight >= 3 ? a.name : `${a.name} (${plural(a.accounts, "account")})`)))}.`);
  }
  if (tight < 1) bullets.push("Balances, equity and every closed trade come straight from the terminals; nothing is entered by hand.");

  const notes = [];
  notes.push([
    "Running since:",
    m.runningSince
      ? `${dayLabel(m.runningSince)} · ${plural(m.tradingDays, "trading day")} across ${plural(m.accounts, "account")} · ${m.profitDays} of ${m.tradingDays} trading days closed in profit.`
      : `no closed trades yet across ${plural(m.accounts, "account")}.`,
  ]);
  notes.push([
    "Combined return:",
    `each account's own return added together, each time-weighted so deposits and withdrawals do not move it.${m.pooledReturn === null ? "" : ` Pooled into one account, the same way, it would be ${pct(m.pooledReturn, { decimals: 1, sign: true })}.`}`,
  ]);

  const shortDay = (key) => dayLabel(key).replace(/\s+\d{4}$/, "");
  let floating;
  if (m.avgFloatingDrawdown === null) {
    floating = "none recorded yet.";
  } else {
    floating = `each account's worst recorded open-trade loss as a % of its balance, or what is open now if deeper, averaged over ${m.accounts}; deepest ${pct(-m.deepestFloatingDrawdown, { decimals: 1 })}.`;
    if (m.floatingSince) {
      const from = m.floatingAllSince && m.floatingAllSince !== m.floatingSince
        ? `from ${dayLabel(m.floatingSince)}, and only from ${dayLabel(m.floatingAllSince)} for the newest account`
        : `only from ${dayLabel(m.floatingSince)}`;
      const g = m.floatingGaps;
      const gapText = !g.length
        ? ""
        : tight >= 4 || g.length > 1
          ? `, with ${plural(g.length, "gap")} of over three days`
          : `, with a gap from ${shortDay(g[0].from)} to ${shortDay(g[0].to)}${m.accounts > 1 && g[0].label ? ` on ${g[0].label}` : ""}`;
      floating += ` Recorded ${from}${gapText}, so trading outside the record is not covered and the true worst may be deeper.`;
    }
    if (m.floatingUnrecorded) floating += ` ${plural(m.floatingUnrecorded, "account")} ${m.floatingUnrecorded === 1 ? "has" : "have"} no record yet.`;
  }
  notes.push(["Floating drawdown:", floating]);
  if (m.otherCurrencies) {
    notes.push(["Currency:", `figures cover the ${plural(m.accounts, `${c} account`)}; ${plural(m.otherCurrencies, "account")} in other currencies ${m.otherCurrencies === 1 ? "is" : "are"} left out, with no exchange rate to add ${m.otherCurrencies === 1 ? "it" : "them"} in honestly.`]);
  }
  return { live, purpose, headline, bullets, notes };
}

// The office printer's fleet summary: one portrait page for whoever holds
// it. What the fleet is for, how each algorithm has done, cumulative
// realised profit, nine headline figures and how they were worked out.
export function fleetReportPdf(model) {
  const m = model;
  const c = m.currency;
  return render(
    (doc) => {
      const COL = colW(doc);
      const X = M;
      const inner = COL - 30;
      // One page, always: nothing below may start a second one.
      doc.page.margins.bottom = 0;
      const FOOT = doc.page.height - 66;
      const END = FOOT - 10;
      const TOP = 146;
      doc.rect(0, 0, doc.page.width, doc.page.height).fillColor("#ffffff").fill();

      const gap = 10, rowGap = 8, cw = (COL - gap * 2) / 3, ch = 50;
      const cardsH = 3 * ch + 2 * rowGap;
      const BULLET = 8.5, LEAD = 9;

      // Measure the words, and drop optional ones until the chart has a
      // fair height; the chart takes whatever is left, up to the sample's.
      const CHART_MIN = 110, CHART_MAX = 150;
      let w, purposeH, bh, howH, nh, perfH, room;
      for (let tight = 0; tight <= 4; tight++) {
        w = fleetWords(m, tight);
        doc.font("Helvetica").fontSize(LEAD);
        purposeH = 30 + doc.heightOfString(pdfText(w.purpose), { width: inner, lineGap: 1.5 });
        doc.font("Helvetica").fontSize(BULLET);
        bh = w.bullets.map((b) => doc.heightOfString(pdfText(b), { width: inner - 18, lineGap: 1.5 }) + 2);
        howH = 15 + 13 + 7 + bh.reduce((a, b) => a + b, 0) + 10;
        nh = w.notes.map(([h, b]) => heightOfLead(doc, inner, h, b) + 5);
        perfH = 30 + nh.reduce((a, b) => a + b, 0) + 6;
        room = END - TOP - (purposeH + 14 + 22 + howH + 14 + 13 + 12 + cardsH + 12 + perfH);
        if (room >= CHART_MIN) break;
      }
      const chartH = Math.max(60, Math.min(CHART_MAX, room));

      // Masthead.
      const tail = spaced(doc, "Fleet summary", X, 40, { color: ACCENT, align: "right", width: COL });
      spaced(doc, `${APP_NAME}   |`, X, 40, { align: "right", width: COL - tail - 14 });
      spaced(doc, "Investor overview", X, 62);
      const [first, ...rest] = APP_NAME.split(" ");
      doc.font("Helvetica-Bold").fontSize(30).fillColor(INK).text(pdfText(rest.length ? `${first} ` : first), X, 79, { continued: Boolean(rest.length), lineBreak: false });
      if (rest.length) doc.fillColor(ACCENT).text(pdfText(rest.join(" ")), { lineBreak: false });
      doc.font("Helvetica").fontSize(9.5).fillColor(BODY).text(pdfText(`${w.live} · Live performance across every managed account`), X, 115, { lineBreak: false });
      doc.moveTo(X, 134).lineTo(X + COL, 134).strokeColor(LINE).lineWidth(0.8).stroke();

      // Purpose.
      let y = TOP;
      softPanel(doc, X, y, COL, purposeH, { bar: true });
      spaced(doc, "Purpose", X + 16, y + 13, { color: ACCENT });
      doc.font("Helvetica").fontSize(LEAD).fillColor(BODY).text(pdfText(w.purpose), X + 16, y + 26, { width: inner, lineGap: 1.5 });
      y += purposeH + 14;

      // How it works.
      doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("How it works", X, y, { lineBreak: false });
      y += 22;
      softPanel(doc, X, y, COL, howH);
      doc.font("Helvetica-Bold").fontSize(LEAD).fillColor(ACCENT).text(pdfText(w.headline), X + 16, y + 15, { width: inner, lineBreak: false, ellipsis: true });
      let by = y + 15 + 13 + 7;
      w.bullets.forEach((b, i) => {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT).text("•", X + 18, by, { lineBreak: false });
        doc.font("Helvetica").fontSize(BULLET).fillColor(BODY).text(pdfText(b), X + 34, by, { width: inner - 18, lineGap: 1.5 });
        by += bh[i];
      });
      y += howH + 14;

      // The curve.
      spaced(doc, "Fleet net profit, cumulative", X, y);
      y += 13;
      profitChart(doc, X, y, COL, chartH, m.curve, c, m.today);
      y += chartH + 12;

      // Nine figures, three to a row.
      const tone = (v) => (v === null || v === undefined || v === 0 ? INK : v > 0 ? GOOD : BAD);
      const cards = [
        [money(m.profit, c, { sign: true }), "Realised profit", tone(m.profit)],
        [pct(m.combinedReturn, { decimals: 1, sign: true }), "Combined return", tone(m.combinedReturn)],
        [m.bestDay ? money(m.bestDay.pnl, c, { sign: true }) : "-", "Best day", m.bestDay ? tone(m.bestDay.pnl) : INK],
        [number(m.trades, 0), "Total trades", ACCENT],
        [number(m.wins, 0), "Winning trades", ACCENT],
        [m.winRate === null ? "-" : pct(m.winRate, { decimals: 1 }), "Win rate", ACCENT],
        [number(m.lots, 2), "Lots traded", ACCENT],
        [m.profitFactor === null ? "-" : number(m.profitFactor, 2), "Profit factor", m.profitFactor === null ? INK : m.profitFactor >= 1 ? GOOD : BAD],
        [m.avgFloatingDrawdown === null ? "-" : pct(-m.avgFloatingDrawdown, { decimals: 1 }), "Avg max floating drawdown", m.avgFloatingDrawdown ? BAD : INK],
      ];
      cards.forEach(([value, label, t], i) => {
        statCard(doc, X + (i % 3) * (cw + gap), y + Math.floor(i / 3) * (ch + rowGap), cw, ch, value, label, t);
      });
      y += cardsH + 12;

      // How the figures were worked out. Never past END, whatever the words.
      const perfAt = Math.min(y, END - perfH);
      softPanel(doc, X, perfAt, COL, perfH);
      spaced(doc, "Fleet performance", X + 16, perfAt + 13, { color: ACCENT });
      let ny = perfAt + 28;
      w.notes.forEach(([h, b], i) => {
        lead(doc, X + 16, ny, inner, h, b);
        ny += nh[i];
      });

      // Footer, under a rule, in the same place on every printing.
      doc.moveTo(X, FOOT).lineTo(X + COL, FOOT).strokeColor(LINE).lineWidth(0.6).stroke();
      doc.font("Helvetica").fontSize(7).fillColor(SLATE).text(
        pdfText(`Fleet summary · ${w.live} · Report date ${dayLabel(m.today)} · Past performance is not indicative of future results`),
        X, FOOT + 10, { width: COL, align: "center", lineBreak: false }
      );
    },
    { footer: false }
  );
}
