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
const COL = PAGE_W - M * 2;
const BOTTOM = PAGE_H - M - 24;

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

function render(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Producer: APP_NAME, Creator: APP_NAME } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))))));
    doc.on("error", reject);
    try {
      draw(doc);
      footers(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function footers(doc) {
  const { start, count } = doc.bufferedPageRange();
  const stamp = `Generated ${londonTime(new Date().toISOString())} London time`;
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7).fillColor(MUTED);
    doc.text(pdfText(`${APP_NAME} · ${stamp}`), M, PAGE_H - M + 8, { width: COL / 2, lineBreak: false });
    doc.text(`Page ${i - start + 1} of ${count}`, M + COL / 2, PAGE_H - M + 8, { width: COL / 2, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > BOTTOM) doc.addPage();
}

function periodLine(range, firstDay) {
  if (range.from) {
    const n = daysInclusive(range.from, range.to);
    return `Period: ${dayLabel(range.from)} to ${dayLabel(range.to)} · ${n} ${n === 1 ? "day" : "days"}`;
  }
  return firstDay ? `Period: whole history, ${dayLabel(firstDay)} to ${dayLabel(range.to)}` : `Period: whole history to ${dayLabel(range.to)}`;
}

function header(doc, { eyebrow, title, lines }) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT).text(pdfText(eyebrow.toUpperCase()), M, M, { characterSpacing: 1 });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text(pdfText(title));
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  for (const l of lines) if (l) doc.text(pdfText(l));
  doc.moveDown(0.8);
  doc.moveTo(M, doc.y).lineTo(M + COL, doc.y).strokeColor(LINE).lineWidth(1).stroke();
  doc.moveDown(0.8);
}

function sectionTitle(doc, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(pdfText(text), M, doc.y);
  doc.moveDown(0.4);
}

// A grid of labelled figures, four to a row.
function figures(doc, items) {
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
function curve(doc, points, currency) {
  const h = 150;
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
    if (doc.y + rowH > BOTTOM) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    let x = M;
    doc.font("Helvetica").fontSize(fontSize);
    r.forEach((cell, i) => {
      const c = cols[i];
      const value = typeof cell === "object" && cell !== null ? cell : { text: cell };
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

    sectionTitle(doc, "Closing balance");
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
