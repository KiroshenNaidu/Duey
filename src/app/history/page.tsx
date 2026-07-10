'use client';

import { useContext, useState, useMemo, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { SwipeTabView } from '@/components/SwipeTabView';
import { formatCurrency, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  ChevronLeft, Pencil, Trash2, Check, Download, FolderOpen,
  CreditCard, PlusCircle, Trophy, Car, Wallet, Zap, Receipt,
  FileText, Tag, Bus, CheckCircle2, Loader2, AlertCircle,
  Search, X,
} from 'lucide-react';
import { showUndoToast } from '@/components/ui/undo-toast';
import { calculateSealedMonthSummary } from '@/lib/calculations';
import type { HistoryEntry, Expense, UberRide, BudgetPlan } from '@/lib/types';
import { format } from 'date-fns';
import { FolderAccess } from '@/lib/folderAccess';
import { DatePickerInput } from '@/components/ui/date-picker';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'all' | 'debts' | 'transport' | 'expenses' | 'budget';
// Reports only — PDF for a polished document, TXT for plain text. Data recovery lives in
// Settings → Data Management as JSON (CSV was dropped: it was neither a good report nor
// a reliable backup format).
type ExportFormat = 'pdf' | 'txt';

const TAB_ORDER: TabId[] = ['all', 'debts', 'transport', 'expenses', 'budget'];

const TAB_LABELS: Record<TabId, string> = {
  all: 'All',
  debts: 'Debts',
  transport: 'Transport',
  expenses: 'Expenses',
  budget: 'Budget',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try { return format(new Date(iso), 'd MMM yyyy'); } catch { return iso; }
}

function buildDateStamp() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function getInitials(name: string) {
  const t = name.trim();
  if (!t) return 'U';
  return t.split(/\s+/).map(w => w[0].toUpperCase()).join('');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Fetches /stark.png (the document-only brand mark, separate from the in-app /logo.png) as raw
// bytes and returns base64 — reliable in Capacitor Android (avoids <img> + canvas + .ico which
// Android WebView cannot decode). Returns '' if the file is missing; exports fall back to text.
async function getLogoBase64(): Promise<string> {
  try {
    const res = await fetch('/stark.png');
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch {
    return '';
  }
}

// ─── PDF table helper ─────────────────────────────────────────────────────────
// Modern report styling shared by every tab's PDF: charcoal header band with the brand
// accent strip, minimal tables (hairline row separators instead of full cell grids),
// accent-tinted total rows, and a timestamped footer.

const PDF_INK = [26, 28, 32] as const;          // near-black body text
const PDF_CHARCOAL = [40, 44, 52] as const;     // header band / table head
const PDF_ACCENT = [151, 223, 104] as const;    // Duey primary (lime) as RGB
const PDF_ACCENT_DARK = [86, 140, 50] as const; // readable accent for text on white
const PDF_ACCENT_TINT = [239, 249, 231] as const; // faint lime fill for total rows

type ColDef = { header: string; width: number; align?: 'left' | 'right' };
type RowData = (string | number)[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTable(doc: any, startY: number, cols: ColDef[], rows: RowData[], totalRow?: RowData, leftMargin = 10): number {
  const LEFT = leftMargin;
  const ROW_H = 7; const HDR_H = 8; const FS = 8; const PB = 270;
  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  let y = startY;

  const drawHeader = () => {
    doc.setFillColor(...PDF_CHARCOAL); doc.rect(LEFT, y, totalWidth, HDR_H, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(FS);
    let x = LEFT;
    for (const col of cols) {
      if (col.align === 'right') doc.text(col.header, x + col.width - 2, y + HDR_H - 2.5, { align: 'right' });
      else doc.text(col.header, x + 2, y + HDR_H - 2.5);
      x += col.width;
    }
    y += HDR_H;
  };

  if (y + HDR_H > PB) { doc.addPage(); y = 15; }
  drawHeader();

  for (let i = 0; i < rows.length; i++) {
    if (y + ROW_H > PB) { doc.addPage(); y = 15; drawHeader(); }
    if (i % 2 === 1) { doc.setFillColor(246, 247, 249); doc.rect(LEFT, y, totalWidth, ROW_H, 'F'); }
    // Hairline separator under each row — lighter than the old full cell grid.
    doc.setDrawColor(226, 229, 234); doc.setLineWidth(0.1);
    doc.line(LEFT, y + ROW_H, LEFT + totalWidth, y + ROW_H);
    doc.setTextColor(...PDF_INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(FS);
    let x = LEFT;
    for (let c = 0; c < cols.length; c++) {
      const cell = String(rows[i][c] ?? '');
      if (cols[c].align === 'right') doc.text(cell, x + cols[c].width - 2, y + ROW_H - 2, { align: 'right' });
      else doc.text(cell, x + 2, y + ROW_H - 2);
      x += cols[c].width;
    }
    y += ROW_H;
  }

  if (totalRow) {
    if (y + HDR_H > PB) { doc.addPage(); y = 15; }
    doc.setFillColor(...PDF_ACCENT_TINT); doc.rect(LEFT, y, totalWidth, HDR_H, 'F');
    doc.setDrawColor(...PDF_ACCENT); doc.setLineWidth(0.5);
    doc.line(LEFT, y, LEFT + totalWidth, y);
    doc.setTextColor(...PDF_ACCENT_DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(FS);
    let x = LEFT;
    for (let c = 0; c < cols.length; c++) {
      const cell = String(totalRow[c] ?? '');
      if (cols[c].align === 'right') doc.text(cell, x + cols[c].width - 2, y + HDR_H - 2.5, { align: 'right' });
      else doc.text(cell, x + 2, y + HDR_H - 2.5);
      x += cols[c].width;
    }
    y += HDR_H;
  }
  return y;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pdfHeader(doc: any, title: string, subtitle: string, name: string, logoBase64?: string): number {
  const W = doc.internal.pageSize.getWidth();
  const dateStr = format(new Date(), 'd MMM yyyy');
  let y = 15;
  doc.setFillColor(...PDF_CHARCOAL);
  doc.rect(0, 0, W, 28, 'F');
  // Brand accent strip under the band — the report's one splash of Duey colour.
  doc.setFillColor(...PDF_ACCENT);
  doc.rect(0, 28, W, 1.2, 'F');
  // The logo (stark.png) is the full brand wordmark — show it large and skip the "DUEY" text.
  // Falls back to the text wordmark only if the logo file is missing.
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', 10, 4, 21, 21);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255);
    doc.text('DUEY', 10, 17);
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text(dateStr, W - 10, 17, { align: 'right' });
  y = 37;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...PDF_INK);
  doc.text(title, 10, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(105, 110, 118);
  doc.text(subtitle + (name ? `  ·  Prepared for ${name}` : ''), 10, y); y += 8;
  return y;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pdfFooter(doc: any) {
  const total = doc.getNumberOfPages();
  const stamp = format(new Date(), "d MMM yyyy 'at' HH:mm");
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(210, 214, 220); doc.setLineWidth(0.3);
    doc.line(10, H - 10, W - 10, H - 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130, 134, 140);
    doc.text(`Page ${i} of ${total}`, 10, H - 6);
    doc.text(`Generated by Duey · ${stamp}`, W - 10, H - 6, { align: 'right' });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pdfSection(doc: any, title: string, y: number): number {
  if (y + 10 > 270) { doc.addPage(); y = 15; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_CHARCOAL);
  doc.text(title.toUpperCase(), 10, y);
  // Accent underline keyed to the title width — section markers share the brand colour.
  doc.setDrawColor(...PDF_ACCENT); doc.setLineWidth(0.7);
  doc.line(10, y + 1.7, 10 + doc.getTextWidth(title.toUpperCase()), y + 1.7);
  return y + 6;
}

// ─── Export builders ──────────────────────────────────────────────────────────

type ExportBuilderArgs = {
  history: HistoryEntry[];
  expenses: Expense[];
  uberRides: UberRide[];
  budgetPlans: BudgetPlan[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debts: any[];
  userName: string;
  tab: TabId;
};

async function buildPdf(args: ExportBuilderArgs): Promise<Blob> {
  const [{ jsPDF }, logoBase64] = await Promise.all([import('jspdf'), getLogoBase64()]);
  const { history, expenses, uberRides, budgetPlans, debts, userName, tab } = args;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  if (tab === 'all') {
    let y = pdfHeader(doc, 'Complete History Report', 'All transactions and events', userName, logoBase64);
    const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Group by month
    const monthMap = new Map<string, HistoryEntry[]>();
    for (const e of sorted) {
      const key = format(new Date(e.date), 'MMMM yyyy');
      if (!monthMap.has(key)) monthMap.set(key, []);
      monthMap.get(key)!.push(e);
    }

    const COLS: ColDef[] = [
      { header: 'Date', width: 28 },
      { header: 'Type', width: 24 },
      { header: 'Description', width: 90 },
      { header: 'Amount (R)', width: 48, align: 'right' },
    ];

    for (const [month, entries] of monthMap) {
      y = pdfSection(doc, month, y);
      const rows: RowData[] = entries.map(e => [
        fmtDate(e.date),
        e.type.charAt(0).toUpperCase() + e.type.slice(1),
        e.debtTitle + (e.label ? ` — ${e.label}` : '') + (e.note ? ` (${e.note})` : ''),
        `R ${e.amount.toFixed(2)}`,
      ]);
      const monthTotal = entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
      y = drawTable(doc, y, COLS, rows, monthTotal > 0 ? ['', '', 'Month Payments Total', `R ${monthTotal.toFixed(2)}`] : undefined);
      y += 5;
    }

    // Expenses section
    if (expenses.length > 0) {
      y = pdfSection(doc, 'Expenses', y);
      const ECOLS: ColDef[] = [{ header: 'Date', width: 28 }, { header: 'Title', width: 70 }, { header: 'Category', width: 40 }, { header: 'Amount (R)', width: 52, align: 'right' }];
      const eRows: RowData[] = expenses.map(e => [fmtDate(e.date), e.title, e.category ?? '—', `R ${e.amount.toFixed(2)}`]);
      const eTotal = expenses.reduce((s, e) => s + e.amount, 0);
      y = drawTable(doc, y, ECOLS, eRows, ['', '', 'Total', `R ${eTotal.toFixed(2)}`]);
      y += 5;
    }

    // Uber rides section
    if (uberRides.length > 0) {
      y = pdfSection(doc, 'Uber Rides', y);
      const UCOLS: ColDef[] = [{ header: 'Date', width: 28 }, { header: 'Route', width: 90 }, { header: 'km', width: 20, align: 'right' }, { header: 'Amount (R)', width: 52, align: 'right' }];
      const uRows: RowData[] = uberRides.map(r => [fmtDate(r.date), r.from && r.to ? `${r.from} → ${r.to}` : (r.from ?? r.to ?? '—'), r.distance ?? '—', `R ${r.price.toFixed(2)}`]);
      const uTotal = uberRides.reduce((s, r) => s + r.price, 0);
      y = drawTable(doc, y, UCOLS, uRows, ['', '', '', `R ${uTotal.toFixed(2)}`]);
    }

  } else if (tab === 'debts') {
    let y = pdfHeader(doc, 'Debt History Report', 'All debt payments, creations and completions', userName, logoBase64);
    const debtEntries = history.filter(h => ['payment', 'creation', 'completion'].includes(h.type));
    const groups = new Map<string, HistoryEntry[]>();
    for (const e of debtEntries) {
      if (!groups.has(e.debtTitle)) groups.set(e.debtTitle, []);
      groups.get(e.debtTitle)!.push(e);
    }

    const COLS: ColDef[] = [
      { header: 'Date', width: 30 },
      { header: 'Event', width: 30 },
      { header: 'Label / Note', width: 72 },
      { header: 'Amount (R)', width: 58, align: 'right' },
    ];

    for (const [debtName, entries] of groups) {
      const debt = debts.find((d: { title: string }) => d.title === debtName);
      const totalOwed = debt?.total_owed ?? entries.find(e => e.type === 'creation')?.amount ?? 0;
      const totalPaid = entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
      const isComplete = entries.some(e => e.type === 'completion');

      y = pdfSection(doc, debtName, y);
      // Debt summary line
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
      const summaryLine = `Total: R ${totalOwed.toFixed(2)}  ·  Paid: R ${totalPaid.toFixed(2)}  ·  Remaining: R ${Math.max(0, totalOwed - totalPaid).toFixed(2)}  ·  ${isComplete ? 'COMPLETED' : 'Active'}`;
      doc.text(summaryLine, 10, y); y += 5;

      // Running balance
      const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let balance = totalOwed;
      const rows: RowData[] = sorted.map(e => {
        let balStr = '';
        if (e.type === 'payment') { balance = Math.max(0, balance - e.amount); balStr = `R ${balance.toFixed(2)} left`; }
        if (e.type === 'creation') { balance = e.amount; }
        return [
          fmtDate(e.date),
          e.type === 'payment' ? 'Payment' : e.type === 'creation' ? 'Created' : 'Completed',
          (e.label ?? e.note ?? (e.type === 'creation' ? `Opened at R ${e.amount.toFixed(2)}` : '')),
          e.type === 'payment' ? `-R ${e.amount.toFixed(2)}  (${balStr})` : `R ${e.amount.toFixed(2)}`,
        ];
      });
      y = drawTable(doc, y, COLS, rows, ['', '', 'Total Paid', `R ${totalPaid.toFixed(2)}`]);
      y += 7;
    }

  } else if (tab === 'transport') {
    let y = pdfHeader(doc, 'Transport History Report', 'Monthly transport payments and Uber rides', userName, logoBase64);
    const transportEntries = [...history.filter(h => h.type === 'transport')].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const sortedUber = [...uberRides].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (transportEntries.length > 0) {
      y = pdfSection(doc, 'Monthly Transport Payments', y);
      const COLS: ColDef[] = [{ header: 'Month', width: 60 }, { header: 'Date Paid', width: 40 }, { header: 'Amount (R)', width: 90, align: 'right' }];
      const rows: RowData[] = transportEntries.map(e => [e.debtTitle.replace('Transport: ', ''), fmtDate(e.date), `R ${e.amount.toFixed(2)}`]);
      const total = transportEntries.reduce((s, e) => s + e.amount, 0);
      y = drawTable(doc, y, COLS, rows, ['', 'Total', `R ${total.toFixed(2)}`]);
      y += 7;
    }

    if (sortedUber.length > 0) {
      y = pdfSection(doc, 'Uber Rides', y);
      const UCOLS: ColDef[] = [
        { header: 'Date', width: 28 },
        { header: 'From', width: 45 },
        { header: 'To', width: 45 },
        { header: 'km', width: 18, align: 'right' },
        { header: 'Amount (R)', width: 54, align: 'right' },
      ];
      const uRows: RowData[] = sortedUber.map(r => [fmtDate(r.date), r.from ?? '—', r.to ?? '—', r.distance ?? '—', `R ${r.price.toFixed(2)}`]);
      const uTotal = sortedUber.reduce((s, r) => s + r.price, 0);
      const avgPrice = sortedUber.length > 0 ? uTotal / sortedUber.length : 0;
      y = drawTable(doc, y, UCOLS, uRows, ['', `${sortedUber.length} rides · avg R ${avgPrice.toFixed(2)}`, '', '', `R ${uTotal.toFixed(2)}`]);
      y += 7;
    }

    if (transportEntries.length === 0 && sortedUber.length === 0) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(130, 130, 130);
      doc.text('No transport history yet.', 10, 80);
    }

  } else if (tab === 'expenses') {
    let y = pdfHeader(doc, 'Expenses Report', 'All recorded expenses by category', userName, logoBase64);
    const sorted = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Group by category
    const catMap = new Map<string, Expense[]>();
    catMap.set('All', sorted);
    for (const e of sorted) {
      const cat = e.category ?? 'Uncategorised';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(e);
    }

    // Summary table first
    y = pdfSection(doc, 'Summary by Category', y);
    const SCOLS: ColDef[] = [{ header: 'Category', width: 140 }, { header: 'Total (R)', width: 50, align: 'right' }];
    const catEntries = Array.from(catMap.entries()).filter(([k]) => k !== 'All');
    const sRows: RowData[] = catEntries.map(([cat, items]) => [cat, `R ${items.reduce((s, e) => s + e.amount, 0).toFixed(2)}`]);
    const grandTotal = sorted.reduce((s, e) => s + e.amount, 0);
    y = drawTable(doc, y, SCOLS, sRows, ['Grand Total', `R ${grandTotal.toFixed(2)}`]);
    y += 8;

    // Full list
    y = pdfSection(doc, 'All Expenses', y);
    const COLS: ColDef[] = [{ header: 'Date', width: 28 }, { header: 'Title', width: 70 }, { header: 'Category', width: 40 }, { header: 'Note', width: 30 }, { header: 'Amount (R)', width: 22, align: 'right' }];
    const rows: RowData[] = sorted.map(e => [fmtDate(e.date), e.title, e.category ?? '—', e.note ?? '', `R ${e.amount.toFixed(2)}`]);
    y = drawTable(doc, y, COLS, rows, ['', '', '', 'Total', `R ${grandTotal.toFixed(2)}`]);

  } else if (tab === 'budget') {
    let y = pdfHeader(doc, 'Budget Plans Report', 'All budget plans with items and spending', userName, logoBase64);

    if (budgetPlans.length === 0) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(130, 130, 130);
      doc.text('No budget plans yet.', 10, 80);
    } else {
      // Summary
      y = pdfSection(doc, 'Plans Summary', y);
      const SCOLS: ColDef[] = [{ header: 'Plan Name', width: 80 }, { header: 'Budget (R)', width: 40, align: 'right' }, { header: 'Spent (R)', width: 40, align: 'right' }, { header: 'Remaining (R)', width: 30, align: 'right' }];
      const sRows: RowData[] = budgetPlans.map(p => {
        const spent = p.items.reduce((s, i) => s + i.price, 0);
        return [p.name, `R ${p.budget.toFixed(2)}`, `R ${spent.toFixed(2)}`, `R ${Math.max(0, p.budget - spent).toFixed(2)}`];
      });
      y = drawTable(doc, y, SCOLS, sRows);
      y += 8;

      // Per-plan detail
      for (const plan of budgetPlans) {
        const spent = plan.items.reduce((s, i) => s + i.price, 0);
        const rem = Math.max(0, plan.budget - spent);
        y = pdfSection(doc, plan.name, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
        doc.text(`Budget: R ${plan.budget.toFixed(2)}  ·  Spent: R ${spent.toFixed(2)}  ·  Remaining: R ${rem.toFixed(2)}  (${((spent / (plan.budget || 1)) * 100).toFixed(0)}% used)`, 10, y);
        y += 5;
        if (plan.items.length > 0) {
          const ICOLS: ColDef[] = [{ header: 'Item', width: 140 }, { header: 'Price (R)', width: 50, align: 'right' }];
          const iRows: RowData[] = plan.items.map(i => [i.name + (i.link ? ` ↗` : ''), `R ${i.price.toFixed(2)}`]);
          y = drawTable(doc, y, ICOLS, iRows, ['Total Spent', `R ${spent.toFixed(2)}`]);
        }
        y += 7;
      }
    }
  }

  pdfFooter(doc);
  return doc.output('blob') as Blob;
}

function buildTxt(args: ExportBuilderArgs): Blob {
  const { history, expenses, uberRides, budgetPlans, tab } = args;
  const lines: string[] = [];
  const sep = '─'.repeat(60);

  if (tab === 'all') {
    lines.push('DUEY — Complete History Export');
    lines.push(`Generated: ${format(new Date(), 'd MMM yyyy')}`);
    lines.push(sep);
    const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const monthMap = new Map<string, HistoryEntry[]>();
    for (const e of sorted) {
      const key = format(new Date(e.date), 'MMMM yyyy');
      if (!monthMap.has(key)) monthMap.set(key, []);
      monthMap.get(key)!.push(e);
    }
    for (const [month, entries] of monthMap) {
      lines.push(`\n${month}`);
      entries.forEach(e => {
        const label = e.label ? ` [${e.label}]` : '';
        const note = e.note ? ` (${e.note})` : '';
        lines.push(`  ${fmtDate(e.date)}  ${e.type.padEnd(12)} ${e.debtTitle}${label}${note}  R ${e.amount.toFixed(2)}`);
      });
    }
  } else if (tab === 'debts') {
    lines.push('DUEY — Debt History Export');
    lines.push(`Generated: ${format(new Date(), 'd MMM yyyy')}`);
    lines.push(sep);
    const debtEntries = history.filter(h => ['payment', 'creation', 'completion'].includes(h.type));
    const groups = new Map<string, HistoryEntry[]>();
    for (const e of debtEntries) { if (!groups.has(e.debtTitle)) groups.set(e.debtTitle, []); groups.get(e.debtTitle)!.push(e); }
    for (const [name, entries] of groups) {
      const totalPaid = entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
      lines.push(`\n${name}`);
      lines.push(`  Total paid: R ${totalPaid.toFixed(2)}`);
      [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .forEach(e => lines.push(`  ${fmtDate(e.date)}  ${e.type.padEnd(10)} R ${e.amount.toFixed(2)}${e.label ? ' — ' + e.label : ''}${e.note ? ' (' + e.note + ')' : ''}`));
    }
  } else if (tab === 'transport') {
    lines.push('DUEY — Transport History Export');
    lines.push(`Generated: ${format(new Date(), 'd MMM yyyy')}`);
    lines.push(sep);
    lines.push('\nMonthly Transport Payments');
    history.filter(h => h.type === 'transport').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach(e => lines.push(`  ${fmtDate(e.date)}  ${e.debtTitle}  R ${e.amount.toFixed(2)}`));
    const transTotal = history.filter(h => h.type === 'transport').reduce((s, e) => s + e.amount, 0);
    lines.push(`  TOTAL: R ${transTotal.toFixed(2)}`);
    lines.push('\nUber Rides');
    uberRides.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach(r => lines.push(`  ${fmtDate(r.date)}  ${r.from ?? ''}${r.from && r.to ? ' → ' : ''}${r.to ?? ''}${r.distance ? ` (${r.distance}km)` : ''}  R ${r.price.toFixed(2)}`));
    const uberTotal = uberRides.reduce((s, r) => s + r.price, 0);
    lines.push(`  TOTAL: R ${uberTotal.toFixed(2)}`);
  } else if (tab === 'expenses') {
    lines.push('DUEY — Expenses Export');
    lines.push(`Generated: ${format(new Date(), 'd MMM yyyy')}`);
    lines.push(sep);
    const sorted = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sorted.forEach(e => lines.push(`  ${fmtDate(e.date)}  ${e.title}${e.category ? ` [${e.category}]` : ''}  R ${e.amount.toFixed(2)}${e.note ? ' — ' + e.note : ''}`));
    lines.push(`\n  TOTAL: R ${sorted.reduce((s, e) => s + e.amount, 0).toFixed(2)}`);
  } else if (tab === 'budget') {
    lines.push('DUEY — Budget Plans Export');
    lines.push(`Generated: ${format(new Date(), 'd MMM yyyy')}`);
    lines.push(sep);
    budgetPlans.forEach(p => {
      const spent = p.items.reduce((s, i) => s + i.price, 0);
      lines.push(`\n${p.name}`);
      lines.push(`  Budget: R ${p.budget.toFixed(2)}  Spent: R ${spent.toFixed(2)}  Remaining: R ${Math.max(0, p.budget - spent).toFixed(2)}`);
      p.items.forEach(i => lines.push(`    - ${i.name}: R ${i.price.toFixed(2)}${i.link ? ` (${i.link})` : ''}`));
    });
  }

  return new Blob([lines.join('\n')], { type: 'text/plain' });
}

// ─── Export Dialog ─────────────────────────────────────────────────────────────

type ExportStatus = 'idle' | 'preparing' | 'saving' | 'success' | 'error';

type TransportExportFilter = 'both' | 'transport' | 'uber';

function ExportDialog({
  open, onClose, tab, initials, exportFolderUri, exportFolderName,
  onPickFolder, onDownload, status, result, onReset,
  transportFilter, onTransportFilterChange,
}: {
  open: boolean;
  onClose: () => void;
  tab: TabId;
  initials: string;
  exportFolderUri: string;
  exportFolderName: string;
  onPickFolder: () => void;
  onDownload: (fmt: ExportFormat) => void;
  status: ExportStatus;
  result: { filename: string; folder: string; error?: string } | null;
  onReset: () => void;
  transportFilter: TransportExportFilter;
  onTransportFilterChange: (f: TransportExportFilter) => void;
}) {
  const [fmt, setFmt] = useState<ExportFormat>('pdf');
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    import('@capacitor/core').then(({ Capacitor }) => setIsNative(Capacitor.isNativePlatform()));
  }, []);

  const busy = status === 'preparing' || status === 'saving';
  const filename = `${initials}-${tab}-${buildDateStamp()}.${fmt}`;
  const folderDisplay = exportFolderName || (isNative ? 'No folder chosen' : 'Downloads folder');

  return (
    // A single dialog drives the whole flow — no second dialog ever opens, which avoids the
    // Radix scroll-lock race that previously froze the app after exporting. Closing is blocked
    // while a file is being written.
    <Dialog open={open} onOpenChange={v => { if (!v && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-sm" onInteractOutside={e => { if (busy) e.preventDefault(); }} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }}>

        {status === 'idle' && (
          <>
            <DialogHeader>
              <DialogTitle>Export {TAB_LABELS[tab]} History</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Format picker — PDF (polished document) or TXT (plain text). JSON data
                  recovery lives in Settings → Data Management. */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Format</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['pdf', 'txt'] as ExportFormat[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setFmt(f)}
                      className={cn(
                        'py-2 rounded-xl text-xs font-semibold border transition-colors flex flex-col items-center gap-1',
                        fmt === f
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/40'
                      )}
                    >
                      <FileText className="h-4 w-4" />
                      {f === 'pdf' ? 'PDF Report' : 'Plain Text'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transport include picker */}
              {tab === 'transport' && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Include</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([['both', 'Both'], ['transport', 'Transport'], ['uber', 'Uber']] as [TransportExportFilter, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => onTransportFilterChange(val)}
                        className={cn(
                          'py-2 rounded-xl text-xs font-semibold border transition-colors',
                          transportFilter === val
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/40'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Save location */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Save to</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={isNative ? onPickFolder : undefined}
                    className={cn(
                      'flex-1 flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-left',
                      isNative && 'hover:bg-muted/60 transition-colors cursor-pointer'
                    )}
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className={cn('text-xs truncate', !exportFolderUri && isNative ? 'text-muted-foreground/60 italic' : 'text-foreground')}>
                      {folderDisplay}
                    </span>
                  </button>
                  {isNative && (
                    <Button size="sm" variant="ghost" onClick={onPickFolder} className="shrink-0 h-9 text-xs">
                      Change
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-1.5 pl-1">{filename}</p>
              </div>
            </div>

            <DialogFooter className="mt-2 gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={() => onDownload(fmt)} className="gap-2">
                <Download className="h-4 w-4" /> Download
              </Button>
            </DialogFooter>
          </>
        )}

        {busy && (
          <>
            <DialogHeader>
              <DialogTitle>{status === 'preparing' ? 'Preparing file…' : 'Saving file…'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="loading-bar-fill h-full w-1/3 rounded-full bg-primary" />
              </div>
              <p className="text-xs text-muted-foreground font-mono">{filename}</p>
            </div>
          </>
        )}

        {status === 'success' && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" /> File saved
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <p className="text-sm font-semibold text-foreground font-mono break-all">{result.filename}</p>
              <p className="text-xs text-muted-foreground">Saved to {result.folder} folder.</p>
            </div>
            <DialogFooter>
              <Button onClick={onClose} className="w-full">Done</Button>
            </DialogFooter>
          </>
        )}

        {status === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" /> Export failed
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">{result?.error ?? 'Something went wrong while exporting.'}</p>
            <DialogFooter className="gap-2">
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Button onClick={() => { onReset(); onDownload(fmt); }} className="gap-2">
                <Download className="h-4 w-4" /> Try again
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  payment:    { label: 'Payment',    color: 'text-primary',          bg: 'bg-primary/15',        Icon: CreditCard  },
  creation:   { label: 'Created',    color: 'text-muted-foreground', bg: 'bg-muted/80',          Icon: PlusCircle  },
  completion: { label: 'Completed',  color: 'text-completion',       bg: 'bg-completion/15',     Icon: Trophy      },
  transport:  { label: 'Transport',  color: 'text-transport',        bg: 'bg-transport/15',      Icon: Car         },
  budget:     { label: 'Budget',     color: 'text-budget',           bg: 'bg-budget/15',         Icon: Wallet      },
  expense:    { label: 'Expense',    color: 'text-expense',          bg: 'bg-expense/15',        Icon: Receipt     },
  employment: { label: 'Employment', color: 'text-employment',       bg: 'bg-employment/15',     Icon: Bus         },
  snapshot:   { label: 'Summary',    color: 'text-snapshot',         bg: 'bg-snapshot/15',       Icon: Zap         },
};

function TypeBadge({ type, label }: { type: string; label?: string }) {
  const cfg = TYPE_CFG[type] ?? TYPE_CFG.payment;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full', cfg.bg, cfg.color)}>
      <cfg.Icon size={10} />
      {label ?? cfg.label}
    </span>
  );
}

// ─── Edit entry dialog ────────────────────────────────────────────────────────
// One consistent popup for every history entry — edit the amount, date, label and
// note in one place (replaces the old inline label-only edit).

type EntryEdit = Partial<Pick<HistoryEntry, 'label' | 'note' | 'amount' | 'date'>>;

function EditEntryDialog({ entry, open, onClose, onSave }: {
  entry: HistoryEntry;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: EntryEdit) => void;
}) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [dateStr, setDateStr] = useState(entry.date.slice(0, 10));
  const [label, setLabel] = useState(entry.label ?? '');
  const [note, setNote] = useState(entry.note ?? '');

  // Re-seed the draft fields whenever the dialog is (re)opened for an entry.
  useEffect(() => {
    if (!open) return;
    setAmount(String(entry.amount));
    setDateStr(entry.date.slice(0, 10));
    setLabel(entry.label ?? '');
    setNote(entry.note ?? '');
  }, [open, entry]);

  const save = () => {
    const parsed = parseFloat(amount);
    // Anchor to local noon so the calendar day never shifts across timezones.
    const iso = dateStr ? new Date(dateStr + 'T12:00:00').toISOString() : entry.date;
    onSave(entry.id, {
      amount: Number.isFinite(parsed) ? parsed : entry.amount,
      date: iso,
      label: label.trim() || undefined,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Amount (R)</p>
            <Input
              type="number" inputMode="decimal" value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              className="text-sm" autoFocus
            />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Date</p>
            <DatePickerInput value={dateStr} onChange={setDateStr} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Label</p>
            <Input
              value={label} onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder="e.g. Interest, Penalty" className="text-sm"
            />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Note</p>
            <Input
              value={note} onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder="Optional note" className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="mt-2 gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="gap-2"><Check className="h-4 w-4" /> Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Entry row (for All + Debts tabs) ─────────────────────────────────────────

function EntryRow({ entry, onUpdate, onDelete, showDebt = false, onSnapshotTap }: {
  entry: HistoryEntry;
  onUpdate: (id: string, data: EntryEdit) => void;
  onDelete: (id: string) => void;
  showDebt?: boolean;
  onSnapshotTap?: (entry: HistoryEntry) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const isSnapshot = entry.type === 'snapshot' && !!onSnapshotTap;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0">
      {/* Snapshot rows open the month breakdown sheet on tap */}
      <button
        className={cn('flex-1 min-w-0 text-left', !isSnapshot && 'cursor-default')}
        onClick={isSnapshot ? () => onSnapshotTap(entry) : undefined}
        disabled={!isSnapshot}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <TypeBadge type={entry.type} label={entry.label} />
          {entry.edited && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground/60">
              <Pencil size={8} /> edited
            </span>
          )}
          {isSnapshot && (
            <span className="text-[9px] font-semibold text-accent">View breakdown ›</span>
          )}
        </div>
        {showDebt && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{entry.debtTitle}</p>}
        <p className="text-xs text-muted-foreground mt-1">{fmtDate(entry.date)}</p>
        {entry.note && <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{entry.note}</p>}
      </button>
      <span className="text-sm font-bold tabular-nums shrink-0">{formatCurrency(entry.amount)}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={() => setEditOpen(true)} className="p-2.5 rounded-xl text-muted-foreground/50 active:bg-muted">
          <Pencil size={13} />
        </button>
        {/* Immediate delete — the global undo toast gives a 5s recovery window */}
        <button
          onClick={() => onDelete(entry.id)}
          className="p-2.5 rounded-xl text-muted-foreground/40 active:bg-destructive/10 active:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <EditEntryDialog entry={entry} open={editOpen} onClose={() => setEditOpen(false)} onSave={onUpdate} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();
  const {
    history, debts, expenses, uberRides, budgetPlans,
    updateHistoryEntry, deleteHistoryEntry, restoreHistoryEntry,
    monthlyIncome, extraIncomes, transportSettings, transportOverrides, transportMonthlyOverrides,
    userProfile, exportFolderUri, exportFolderName, setExportFolder, setAppError,
  } = useContext(AppDataContext);

  const [activeTab, setActiveTab] = useState<TabId>('all');

  // All-tab search + quick filters
  const [query, setQuery] = useState('');
  const [filterThisMonth, setFilterThisMonth] = useState(false);
  const [filterBig, setFilterBig] = useState(false);     // amount ≥ 500
  const [filterEdited, setFilterEdited] = useState(false);

  // Snapshot breakdown sheet
  const [snapshotEntry, setSnapshotEntry] = useState<HistoryEntry | null>(null);

  // Delete immediately with a 5s undo window (replaces the old confirm dialog).
  const handleDeleteEntry = (id: string) => {
    const entry = history.find(h => h.id === id);
    if (!entry) return;
    deleteHistoryEntry(id);
    showUndoToast(`Deleted ${entry.debtTitle}`, () => restoreHistoryEntry(entry));
  };
  const [exportOpen, setExportOpen] = useState(false);
  const [choosingFolder, setChoosingFolder] = useState(false);
  // Single-dialog export flow: 'idle' shows the picker, then preparing→saving→success/error.
  const [exportStatus, setExportStatus] = useState<'idle' | 'preparing' | 'saving' | 'success' | 'error'>('idle');
  const [exportResult, setExportResult] = useState<{ filename: string; folder: string; error?: string } | null>(null);

  // Transport tab filters
  const [transportMonth, setTransportMonth] = useState<string>('all');
  const [showTransportEntries, setShowTransportEntries] = useState(true);
  const [showUberEntries, setShowUberEntries] = useState(true);
  const [transportExportFilter, setTransportExportFilter] = useState<TransportExportFilter>('both');

  const initials = getInitials(userProfile.name);

  // Reset scroll synchronously after every tab change, before paint. Swipe gestures are
  // owned by SwipeTabView (the same finger-tracked carousel the main pages use).
  useLayoutEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab]);

  const changeTab = (tab: TabId) => setActiveTab(tab);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const { allSorted, debtGroups, transportEntries, totalPaid, paymentCount } = useMemo(() => {
    const allSorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const totalPaid = history.filter(h => h.type === 'payment').reduce((s, h) => s + h.amount, 0);
    const paymentCount = history.filter(h => h.type === 'payment').length;
    const transportEntries = allSorted.filter(h => h.type === 'transport');

    const debtEntries = allSorted.filter(h => ['payment', 'creation', 'completion'].includes(h.type));
    const groups = new Map<string, HistoryEntry[]>();
    for (const e of debtEntries) {
      if (!groups.has(e.debtTitle)) groups.set(e.debtTitle, []);
      groups.get(e.debtTitle)!.push(e);
    }

    return { allSorted, debtGroups: Array.from(groups.entries()), transportEntries, totalPaid, paymentCount };
  }, [history]);

  const monthGroups = useMemo(() => {
    // Apply All-tab search + quick filters before grouping by month.
    const q = query.trim().toLowerCase();
    const thisMonthKey = format(new Date(), 'yyyy-MM');
    const filtered = allSorted.filter(e => {
      if (filterThisMonth && format(new Date(e.date), 'yyyy-MM') !== thisMonthKey) return false;
      if (filterBig && e.amount < 500) return false;
      if (filterEdited && !e.edited) return false;
      if (q) {
        const haystack = `${e.debtTitle} ${e.label ?? ''} ${e.note ?? ''} ${e.amount}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const map = new Map<string, HistoryEntry[]>();
    for (const e of filtered) {
      const key = format(new Date(e.date), 'MMMM yyyy');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [allSorted, query, filterThisMonth, filterBig, filterEdited]);

  const hasActiveFilter = !!query.trim() || filterThisMonth || filterBig || filterEdited;

  const sortedUber = useMemo(() => [...uberRides].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [uberRides]);
  const sortedExpenses = useMemo(() => [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [expenses]);

  // Transport tab: available months (from both transport entries + uber rides)
  const transportMonths = useMemo(() => {
    const keys = new Set<string>();
    transportEntries.forEach(e => keys.add(e.date.slice(0, 7)));
    uberRides.forEach(r => keys.add(r.date.slice(0, 7)));
    return Array.from(keys).sort((a, b) => b.localeCompare(a)).map(key => ({
      key,
      label: format(new Date(key + '-01'), 'MMM yyyy'),
    }));
  }, [transportEntries, uberRides]);

  // Combined transport + uber list filtered by month and toggles, sorted newest first
  const combinedTransport = useMemo((): ({ kind: 'transport'; entry: HistoryEntry; date: number } | { kind: 'uber'; ride: UberRide; date: number })[] => {
    const items: ({ kind: 'transport'; entry: HistoryEntry; date: number } | { kind: 'uber'; ride: UberRide; date: number })[] = [];
    if (showTransportEntries) {
      transportEntries.forEach(e => {
        if (transportMonth === 'all' || e.date.startsWith(transportMonth)) {
          items.push({ kind: 'transport', entry: e, date: new Date(e.date).getTime() });
        }
      });
    }
    if (showUberEntries) {
      uberRides.forEach(r => {
        if (transportMonth === 'all' || r.date.startsWith(transportMonth)) {
          items.push({ kind: 'uber', ride: r, date: new Date(r.date).getTime() });
        }
      });
    }
    return items.sort((a, b) => b.date - a.date);
  }, [transportEntries, uberRides, transportMonth, showTransportEntries, showUberEntries]);

  // Group combined transport entries by month for rendering
  const combinedTransportByMonth = useMemo(() => {
    const map = new Map<string, typeof combinedTransport>();
    for (const item of combinedTransport) {
      const key = (item.kind === 'transport' ? item.entry.date : item.ride.date).slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [combinedTransport]);

  // ── Tab summary stats ─────────────────────────────────────────────────────────
  const tabStats = useMemo(() => ({
    all: { label: formatCurrency(totalPaid), sub: `${paymentCount} payments` },
    debts: { label: formatCurrency(totalPaid), sub: `across ${debtGroups.length} debt${debtGroups.length !== 1 ? 's' : ''}` },
    transport: { label: formatCurrency(transportEntries.reduce((s, e) => s + e.amount, 0) + uberRides.reduce((s, r) => s + r.price, 0)), sub: `${transportEntries.length} months · ${uberRides.length} Uber rides` },
    expenses: { label: formatCurrency(expenses.reduce((s, e) => s + e.amount, 0)), sub: `${expenses.length} expense${expenses.length !== 1 ? 's' : ''}` },
    budget: { label: `${budgetPlans.length} plan${budgetPlans.length !== 1 ? 's' : ''}`, sub: formatCurrency(budgetPlans.flatMap(p => p.items).reduce((s, i) => s + i.price, 0)) + ' budgeted' },
  }), [totalPaid, paymentCount, debtGroups, transportEntries, uberRides, expenses, budgetPlans]);

  // ── Folder picker ─────────────────────────────────────────────────────────────
  const pickFolder = async () => {
    setChoosingFolder(true);
    try {
      const res = await FolderAccess.pickFolder();
      setExportFolder(res.uri, res.name || 'Selected folder');
    } catch { /* user cancelled */ }
    finally { setChoosingFolder(false); }
  };

  // Reset + close the export dialog, clearing any leftover Radix body scroll-lock.
  const closeExport = () => {
    setExportOpen(false);
    setExportStatus('idle');
    setExportResult(null);
    // Defensive: ensure no stale pointer-events lock remains on <body> after the dialog unmounts.
    setTimeout(() => { document.body.style.pointerEvents = ''; }, 0);
  };

  // ── Download handler ──────────────────────────────────────────────────────────
  // Runs entirely inside the single export dialog (no second dialog opens), driving the
  // preparing → saving → success/error progress UI.
  const handleDownload = async (fmt: ExportFormat) => {
    const filteredHistory = activeTab === 'transport' && transportExportFilter === 'uber'
      ? history.filter(h => h.type !== 'transport')
      : history;
    const filteredUberRides = activeTab === 'transport' && transportExportFilter === 'transport'
      ? []
      : uberRides;
    const args: ExportBuilderArgs = { history: filteredHistory, expenses, uberRides: filteredUberRides, budgetPlans, debts, userName: userProfile.name, tab: activeTab };
    const filename = `${initials || 'U'}-${activeTab}-${buildDateStamp()}.${fmt}`;
    setExportStatus('preparing');
    setExportResult(null);
    try {
      let blob: Blob;
      if (fmt === 'pdf') blob = await buildPdf(args);
      else blob = buildTxt(args);

      setExportStatus('saving');
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        triggerDownload(blob, filename);
        setExportResult({ filename, folder: 'Downloads' });
        setExportStatus('success');
        return;
      }

      let uri = exportFolderUri;
      let folderName = exportFolderName || 'your folder';
      if (!uri) {
        const picked = await FolderAccess.pickFolder().catch(() => null);
        if (!picked) { setExportStatus('idle'); return; }
        setExportFolder(picked.uri, picked.name || 'Selected folder');
        uri = picked.uri; folderName = picked.name;
      }

      const base64 = await blobToBase64(blob);
      const saved = await FolderAccess.saveFile({ folderUri: uri, name: filename, mimeType: blob.type || 'application/octet-stream', data: base64 });

      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.createChannel({ id: 'downloads', name: 'Downloads', description: 'File download notifications', importance: 3, visibility: 1 });
        await LocalNotifications.schedule({ notifications: [{ title: 'File Saved', body: `Tap to open ${filename}`, id: (Date.now() % 100000) + 1000, channelId: 'downloads', extra: { fileUri: saved.uri, mimeType: blob.type || 'application/octet-stream' } }] });
      } catch { /* notification failure is non-fatal */ }

      setExportResult({ filename, folder: folderName });
      setExportStatus('success');
    } catch (err) {
      setExportResult({ filename, folder: '', error: `Could not export ${fmt.toUpperCase()} file.` });
      setExportStatus('error');
      setAppError({ friendly: `Could not export ${fmt.toUpperCase()} file.`, operation: `handleDownload (${activeTab}/${fmt}) in HistoryPage`, error: err, ts: Date.now() });
    }
  };

  // Current month is still "live" — its entries stay editable and only finalize into a
  // permanent monthly summary once the month ends (see the month-end seal in AppDataContext).
  const currentMonthLabel = format(new Date(), 'MMMM yyyy');

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.22 }}
      className="container mx-auto max-w-md pt-12 pb-10 px-4 min-h-screen"
    >
      {/* Header */}
      <div className="relative flex items-center justify-center pb-4">
        <button onClick={() => router.back()} className="absolute left-0 p-2.5 rounded-full active:bg-secondary transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-bold">History</h1>
          <p className="text-xs text-muted-foreground">All transactions & events</p>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-4">
        {TAB_ORDER.map(tab => (
          <button
            key={tab}
            onClick={() => changeTab(tab)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors',
              activeTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Summary — split Transport vs Uber on the transport tab, single pill elsewhere */}
      {activeTab === 'transport' ? (
        <div className="space-y-2 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card rounded-2xl px-4 py-3.5">
              <p className="text-lg font-black tabular-nums text-primary">
                {formatCurrency(transportEntries.reduce((s, e) => s + e.amount, 0))}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                Transport · {transportEntries.length} month{transportEntries.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="bg-card rounded-2xl px-4 py-3.5">
              <p className="text-lg font-black tabular-nums text-primary">
                {formatCurrency(uberRides.reduce((s, r) => s + r.price, 0))}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                Uber · {uberRides.length} ride{uberRides.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => setExportOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-card rounded-2xl py-2.5 text-xs font-semibold text-muted-foreground active:bg-muted/60 transition-colors"
          >
            <Download size={14} /> Export
          </button>
        </div>
      ) : (
        <div className="relative bg-card rounded-2xl overflow-hidden px-4 py-3.5 mb-4">
          <button
            onClick={() => setExportOpen(true)}
            className="absolute inset-y-0 right-0 w-14 flex items-center justify-center rounded-r-2xl text-muted-foreground/40 active:bg-muted/60 transition-colors"
          >
            <Download size={16} />
          </button>
          <p className="text-lg font-black tabular-nums text-primary">{tabStats[activeTab].label}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{tabStats[activeTab].sub}</p>
        </div>
      )}

      {/* Content — the same finger-tracked carousel the main pages use: panels follow
          the finger 1:1, rubber-band at the ends, and commit with velocity projection. */}
      <SwipeTabView
        tabs={TAB_ORDER}
        active={activeTab}
        onChange={changeTab}
        renderTab={tab => (
      <div>

        {/* ALL TAB */}
        {tab === 'all' && (
          <div className="space-y-3">
            {/* Search + quick filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search title, note, amount…"
                  className="pl-9 pr-8 h-9 text-xs rounded-2xl"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground/50 active:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { label: 'This month', on: filterThisMonth, toggle: () => setFilterThisMonth(v => !v) },
                  { label: 'R500+', on: filterBig, toggle: () => setFilterBig(v => !v) },
                  { label: 'Edited', on: filterEdited, toggle: () => setFilterEdited(v => !v) },
                ] as const).map(chip => (
                  <button
                    key={chip.label}
                    onClick={chip.toggle}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[10px] font-semibold transition-colors',
                      chip.on ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {monthGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center mt-24 gap-3 text-muted-foreground">
                <Receipt size={48} className="opacity-20" />
                <p className="text-sm">{hasActiveFilter ? 'Nothing matches your search' : 'No history yet'}</p>
              </div>
            )}
            {monthGroups.map(([month, entries]) => (
              <Card key={month} className="overflow-hidden cv-auto">
                <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{month}</p>
                    {month === currentMonthLabel && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-primary shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        Live · finalizes month-end
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                    {formatCurrency(entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0))} paid
                  </p>
                </div>
                <CardContent className="px-4 pb-2 pt-0">
                  {entries.map(entry => (
                    <EntryRow key={entry.id} entry={entry} onUpdate={updateHistoryEntry} onDelete={handleDeleteEntry} showDebt onSnapshotTap={setSnapshotEntry} />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* DEBTS TAB */}
        {tab === 'debts' && (
          <div className="space-y-3">
            {debtGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center mt-24 gap-3 text-muted-foreground">
                <CreditCard size={48} className="opacity-20" />
                <p className="text-sm">No debt history yet</p>
              </div>
            )}
            {debtGroups.map(([debtTitle, items]) => {
              const groupTotal = items.filter(i => i.type === 'payment').reduce((s, i) => s + i.amount, 0);
              const isComplete = items.some(i => i.type === 'completion');
              return (
                <Card key={debtTitle} className="overflow-hidden cv-auto">
                  <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{debtTitle}</p>
                      {isComplete && <span className="text-[9px] bg-positive/15 text-positive px-1.5 py-0.5 rounded-full font-semibold">PAID OFF</span>}
                    </div>
                    {groupTotal > 0 && <p className="text-[10px] text-muted-foreground/60 tabular-nums">{formatCurrency(groupTotal)} paid</p>}
                  </div>
                  <CardContent className="px-4 pb-2 pt-0">
                    {items.map(entry => (
                      <EntryRow key={entry.id} entry={entry} onUpdate={updateHistoryEntry} onDelete={handleDeleteEntry} />
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* TRANSPORT TAB */}
        {tab === 'transport' && (
          <div className="space-y-3">

            {/* Month picker — stopPropagation prevents horizontal scroll from triggering the page swipe handler */}
            {transportMonths.length > 0 && (
              <div
                className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar"
                onTouchStart={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
                onTouchEnd={e => e.stopPropagation()}
              >
                <button
                  onClick={() => setTransportMonth('all')}
                  className={cn(
                    'shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors',
                    transportMonth === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  )}
                >
                  All
                </button>
                {transportMonths.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setTransportMonth(m.key)}
                    className={cn(
                      'shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors',
                      transportMonth === m.key ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {/* Type toggles */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowTransportEntries(v => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                  showTransportEntries
                    ? 'bg-transport/15 text-transport border-transport/30'
                    : 'bg-transparent text-muted-foreground border-border/50 opacity-50'
                )}
              >
                <Car size={11} /> Transport
              </button>
              <button
                onClick={() => setShowUberEntries(v => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                  showUberEntries
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-transparent text-muted-foreground border-border/50 opacity-50'
                )}
              >
                <Car size={11} /> Uber
              </button>
            </div>

            {/* Combined list — separate card per month when All is selected */}
            {combinedTransportByMonth.map(([monthKey, items]) => (
                <Card key={monthKey} className="overflow-hidden">
                  {transportMonth === 'all' && (
                    <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {format(new Date(monthKey + '-01'), 'MMMM yyyy')}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 tabular-nums">
                        {formatCurrency(items.reduce((s, i) => s + (i.kind === 'transport' ? i.entry.amount : i.ride.price), 0))}
                      </p>
                    </div>
                  )}
                  <CardContent className="px-4 pb-2 pt-3">
                    {items.map(item => item.kind === 'transport' ? (
                      <EntryRow
                        key={item.entry.id}
                        entry={item.entry}
                        onUpdate={updateHistoryEntry}
                        onDelete={deleteHistoryEntry}
                      />
                    ) : (
                      <div key={item.ride.id} className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0">
                        <div className="w-0.5 self-stretch rounded-full bg-primary/60 shrink-0 -ml-1 mr-1" />
                        <div className="flex-1 min-w-0">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/15 text-primary">
                            <Car size={10} /> Uber
                          </span>
                          {(item.ride.from || item.ride.to) && (
                            <p className="text-xs font-medium text-foreground mt-1 truncate">
                              {item.ride.from}{item.ride.from && item.ride.to ? ' → ' : ''}{item.ride.to}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtDate(item.ride.date)}{item.ride.distance ? ` · ${item.ride.distance}km` : ''}
                          </p>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0 text-primary">{formatCurrency(item.ride.price)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
            ))}

            {combinedTransportByMonth.length === 0 && (
              <div className="flex flex-col items-center justify-center mt-20 gap-3 text-muted-foreground">
                <Car size={48} className="opacity-20" />
                <p className="text-sm">
                  {transportEntries.length === 0 && uberRides.length === 0
                    ? 'No transport history yet'
                    : 'Nothing to show — try adjusting filters'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* EXPENSES TAB */}
        {tab === 'expenses' && (
          <div className="space-y-3">
            {sortedExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center mt-24 gap-3 text-muted-foreground">
                <Receipt size={48} className="opacity-20" />
                <p className="text-sm">No expenses yet</p>
              </div>
            ) : (
              <Card className="overflow-hidden">
                <CardContent className="px-4 pb-2 pt-4 space-y-0">
                  {sortedExpenses.map(expense => (
                    <div key={expense.id} className="cv-auto flex items-center gap-3 py-3 border-b border-border/30 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate">{expense.title}</span>
                          {expense.category && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense/15 text-expense">
                              <Tag size={9} />{expense.category}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtDate(expense.date)}{expense.note && <> · {expense.note}</>}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0">{formatCurrency(expense.amount)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* BUDGET TAB */}
        {tab === 'budget' && (
          <div className="space-y-3">
            {budgetPlans.length === 0 ? (
              <div className="flex flex-col items-center justify-center mt-24 gap-3 text-muted-foreground">
                <Wallet size={48} className="opacity-20" />
                <p className="text-sm">No budget plans yet</p>
              </div>
            ) : budgetPlans.map(plan => {
              const spent = plan.items.reduce((s, i) => s + i.price, 0);
              const rem = Math.max(0, plan.budget - spent);
              const pct = plan.budget > 0 ? Math.min(100, (spent / plan.budget) * 100) : 0;
              return (
                <Card key={plan.id} className="overflow-hidden cv-auto">
                  <div className="px-4 pt-4 pb-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-foreground">{plan.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(spent)} / {formatCurrency(plan.budget)}</p>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(rem)} remaining · {pct.toFixed(0)}% used</p>
                  </div>
                  {plan.items.length > 0 && (
                    <CardContent className="px-4 pb-3 pt-0">
                      <div className="border-t border-border/30 pt-2 space-y-1.5">
                        {plan.items.map(item => (
                          <div key={item.id} className="flex items-center justify-between">
                            <span className="text-xs text-foreground truncate flex-1 pr-2">{item.name}</span>
                            <span className="text-xs font-semibold tabular-nums shrink-0">{formatCurrency(item.price)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
        )}
      />

      {/* Export — single dialog: pick format/folder, then live progress, then result */}
      <ExportDialog
        open={exportOpen}
        onClose={closeExport}
        tab={activeTab}
        initials={initials}
        exportFolderUri={exportFolderUri}
        exportFolderName={exportFolderName}
        onPickFolder={pickFolder}
        onDownload={handleDownload}
        status={exportStatus}
        result={exportResult}
        onReset={() => setExportStatus('idle')}
        transportFilter={transportExportFilter}
        onTransportFilterChange={setTransportExportFilter}
      />

      {/* Snapshot breakdown — tap a monthly Summary row to see the full income/outgoings split */}
      <Dialog open={!!snapshotEntry} onOpenChange={v => { if (!v) setSnapshotEntry(null); }}>
        <DialogContent className="sm:max-w-sm">
          {snapshotEntry && (() => {
            const monthKey = format(new Date(snapshotEntry.date), 'yyyy-MM');
            const monthLabel = format(new Date(snapshotEntry.date), 'MMMM yyyy');
            // Prefer the exact figures captured when the month was sealed. Only fall back to
            // a live recompute for older snapshots saved before the breakdown was persisted —
            // recomputing drifts once one-time extra incomes/expenses have been purged.
            const recomputed = !snapshotEntry.snapshot;
            const s = snapshotEntry.snapshot ?? calculateSealedMonthSummary(
              { monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, transportSettings, transportOverrides, transportMonthlyOverrides },
              monthKey,
            );
            const rows: { label: string; value: number; negative?: boolean }[] = [
              { label: 'Income', value: s.income },
              { label: 'Transport', value: s.transport, negative: true },
              { label: 'Uber / rides', value: s.uber, negative: true },
              { label: 'Debt payments', value: s.debt, negative: true },
              { label: 'Expenses', value: s.expenses, negative: true },
              { label: 'Budget (confirmed)', value: s.budget, negative: true },
            ];
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{monthLabel} breakdown</DialogTitle>
                </DialogHeader>
                <div className="space-y-0.5">
                  {rows.filter(r => r.value > 0 || r.label === 'Income').map(r => (
                    <div key={r.label} className="flex justify-between items-baseline py-2 border-b border-border/30 last:border-0">
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                      <span className={cn('text-sm font-semibold tabular-nums', r.negative ? 'text-destructive' : 'text-positive')}>
                        {r.negative ? '−' : ''}{formatCurrency(r.value)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-baseline pt-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {s.remaining >= 0 ? 'Surplus' : 'Deficit'}
                    </span>
                    <span className={cn('text-lg font-bold tabular-nums', s.remaining >= 0 ? 'text-positive' : 'text-destructive')}>
                      {formatCurrency(Math.abs(s.remaining))}
                    </span>
                  </div>
                  {recomputed && (
                    <p className="text-[10px] text-muted-foreground/60 pt-2">
                      Recomputed from this month&apos;s stored entries. Salary uses your current monthly income.
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
