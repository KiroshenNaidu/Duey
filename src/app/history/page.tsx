'use client';

import { useContext, useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  ChevronLeft, Pencil, Trash2, Check, X, Download, FolderOpen,
  CreditCard, PlusCircle, Trophy, Car, Wallet, Zap, Receipt,
  FileText, Sheet, Tag, Bus, CheckCircle2,
} from 'lucide-react';
import type { HistoryEntry, Expense, UberRide, BudgetPlan } from '@/lib/types';
import { format } from 'date-fns';
import { FolderAccess } from '@/lib/folderAccess';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'all' | 'debts' | 'transport' | 'expenses' | 'budget';
type ExportFormat = 'pdf' | 'csv' | 'txt';

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

// ─── PDF table helper ─────────────────────────────────────────────────────────

type ColDef = { header: string; width: number; align?: 'left' | 'right' };
type RowData = (string | number)[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTable(doc: any, startY: number, cols: ColDef[], rows: RowData[], totalRow?: RowData, leftMargin = 10): number {
  const LEFT = leftMargin;
  const ROW_H = 7; const HDR_H = 8; const FS = 8; const PB = 270;
  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  let y = startY;

  const drawHeader = () => {
    doc.setFillColor(40, 44, 52); doc.rect(LEFT, y, totalWidth, HDR_H, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(FS);
    let x = LEFT;
    for (const col of cols) {
      if (col.align === 'right') doc.text(col.header, x + col.width - 1.5, y + HDR_H - 2, { align: 'right' });
      else doc.text(col.header, x + 1.5, y + HDR_H - 2);
      x += col.width;
    }
    y += HDR_H;
  };

  if (y + HDR_H > PB) { doc.addPage(); y = 15; }
  drawHeader();

  for (let i = 0; i < rows.length; i++) {
    if (y + ROW_H > PB) { doc.addPage(); y = 15; drawHeader(); }
    if (i % 2 === 1) { doc.setFillColor(245, 246, 248); doc.rect(LEFT, y, totalWidth, ROW_H, 'F'); }
    doc.setDrawColor(200, 205, 212); doc.setLineWidth(0.1); doc.rect(LEFT, y, totalWidth, ROW_H, 'S');
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal'); doc.setFontSize(FS);
    let x = LEFT;
    for (let c = 0; c < cols.length; c++) {
      const cell = String(rows[i][c] ?? '');
      if (cols[c].align === 'right') doc.text(cell, x + cols[c].width - 1.5, y + ROW_H - 2, { align: 'right' });
      else doc.text(cell, x + 1.5, y + ROW_H - 2);
      x += cols[c].width;
    }
    y += ROW_H;
  }

  if (totalRow) {
    if (y + HDR_H > PB) { doc.addPage(); y = 15; }
    doc.setFillColor(210, 218, 230); doc.rect(LEFT, y, totalWidth, HDR_H, 'F');
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(FS);
    let x = LEFT;
    for (let c = 0; c < cols.length; c++) {
      const cell = String(totalRow[c] ?? '');
      if (cols[c].align === 'right') doc.text(cell, x + cols[c].width - 1.5, y + HDR_H - 2, { align: 'right' });
      else doc.text(cell, x + 1.5, y + HDR_H - 2);
      x += cols[c].width;
    }
    y += HDR_H;
  }
  return y;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pdfHeader(doc: any, title: string, subtitle: string, name: string): number {
  const W = doc.internal.pageSize.getWidth();
  const dateStr = format(new Date(), 'd MMM yyyy');
  let y = 15;
  doc.setFillColor(40, 44, 52);
  doc.rect(0, 0, W, 22, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255);
  doc.text('DUEY', 10, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(dateStr, W - 10, 14, { align: 'right' });
  y = 28;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 30, 30);
  doc.text(title, 10, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
  doc.text(subtitle, 10, y); y += 4;
  if (name) { doc.text(`Prepared for: ${name}`, 10, y); y += 4; }
  doc.setDrawColor(180, 185, 192); doc.setLineWidth(0.4);
  doc.line(10, y, W - 10, y); y += 6;
  return y;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pdfFooter(doc: any) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(180, 185, 192); doc.setLineWidth(0.3);
    doc.line(10, H - 10, W - 10, H - 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${total}`, 10, H - 6);
    doc.text('Duey Report', W - 10, H - 6, { align: 'right' });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pdfSection(doc: any, title: string, y: number): number {
  if (y + 10 > 270) { doc.addPage(); y = 15; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 44, 52);
  doc.text(title.toUpperCase(), 10, y);
  doc.setDrawColor(40, 44, 52); doc.setLineWidth(0.3);
  doc.line(10, y + 1.5, 10 + doc.getTextWidth(title.toUpperCase()), y + 1.5);
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
  const { jsPDF } = await import('jspdf');
  const { history, expenses, uberRides, budgetPlans, debts, userName, tab } = args;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  if (tab === 'all') {
    let y = pdfHeader(doc, 'Complete History Report', 'All transactions and events', userName);
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
    let y = pdfHeader(doc, 'Debt History Report', 'All debt payments, creations and completions', userName);
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
    let y = pdfHeader(doc, 'Transport History Report', 'Monthly transport payments and Uber rides', userName);
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
    let y = pdfHeader(doc, 'Expenses Report', 'All recorded expenses by category', userName);
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
    let y = pdfHeader(doc, 'Budget Plans Report', 'All budget plans with items and spending', userName);

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

function buildCsv(args: ExportBuilderArgs): Blob {
  const { history, expenses, uberRides, budgetPlans, tab } = args;
  const rows: string[][] = [];

  if (tab === 'all') {
    rows.push(['Date', 'Type', 'Description', 'Label', 'Note', 'Amount (R)']);
    const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sorted.forEach(e => rows.push([fmtDate(e.date), e.type, e.debtTitle, e.label ?? '', e.note ?? '', e.amount.toFixed(2)]));
    rows.push([]);
    rows.push(['Date', 'Type', 'Title', 'Category', 'Note', 'Amount (R)']);
    expenses.forEach(e => rows.push([fmtDate(e.date), 'expense', e.title, e.category ?? '', e.note ?? '', e.amount.toFixed(2)]));
    rows.push([]);
    rows.push(['Date', 'Type', 'From', 'To', 'km', 'Price (R)']);
    uberRides.forEach(r => rows.push([fmtDate(r.date), 'uber', r.from ?? '', r.to ?? '', r.distance?.toString() ?? '', r.price.toFixed(2)]));
  } else if (tab === 'debts') {
    rows.push(['Date', 'Debt', 'Event', 'Label', 'Note', 'Amount (R)']);
    const debtEntries = [...history.filter(h => ['payment', 'creation', 'completion'].includes(h.type))]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    debtEntries.forEach(e => rows.push([fmtDate(e.date), e.debtTitle, e.type, e.label ?? '', e.note ?? '', e.amount.toFixed(2)]));
  } else if (tab === 'transport') {
    rows.push(['Date', 'Description', 'Amount (R)']);
    history.filter(h => h.type === 'transport').forEach(e => rows.push([fmtDate(e.date), e.debtTitle, e.amount.toFixed(2)]));
    rows.push([]);
    rows.push(['Date', 'From', 'To', 'Distance (km)', 'Price (R)']);
    uberRides.forEach(r => rows.push([fmtDate(r.date), r.from ?? '', r.to ?? '', r.distance?.toString() ?? '', r.price.toFixed(2)]));
  } else if (tab === 'expenses') {
    rows.push(['Date', 'Title', 'Category', 'Note', 'Amount (R)']);
    [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach(e => rows.push([fmtDate(e.date), e.title, e.category ?? '', e.note ?? '', e.amount.toFixed(2)]));
  } else if (tab === 'budget') {
    rows.push(['Plan', 'Budget (R)', 'Item', 'Price (R)', 'Link']);
    budgetPlans.forEach(p => p.items.forEach(i => rows.push([p.name, p.budget.toFixed(2), i.name, i.price.toFixed(2), i.link ?? ''])));
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  return new Blob([csv], { type: 'text/csv' });
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

function ExportDialog({
  open, onClose, tab, initials, exportFolderUri, exportFolderName,
  onPickFolder, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  tab: TabId;
  initials: string;
  exportFolderUri: string;
  exportFolderName: string;
  onPickFolder: () => void;
  onConfirm: (fmt: ExportFormat) => void;
}) {
  const [fmt, setFmt] = useState<ExportFormat>('pdf');
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    import('@capacitor/core').then(({ Capacitor }) => setIsNative(Capacitor.isNativePlatform()));
  }, []);

  const filename = `${initials}-${tab}-${buildDateStamp()}.${fmt}`;
  const folderDisplay = exportFolderName || (isNative ? 'No folder chosen' : 'Downloads folder');

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Export {TAB_LABELS[tab]} History</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format picker */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Format</p>
            <div className="grid grid-cols-3 gap-2">
              {(['pdf', 'csv', 'txt'] as ExportFormat[]).map(f => (
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
                  {f === 'pdf' && <FileText className="h-4 w-4" />}
                  {f === 'csv' && <Sheet className="h-4 w-4" />}
                  {f === 'txt' && <FileText className="h-4 w-4" />}
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

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
          <Button onClick={() => { onConfirm(fmt); onClose(); }} className="gap-2">
            <Download className="h-4 w-4" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  payment:    { label: 'Payment',    color: 'text-primary',          bg: 'bg-primary/15',        Icon: CreditCard  },
  creation:   { label: 'Created',    color: 'text-muted-foreground', bg: 'bg-muted/80',          Icon: PlusCircle  },
  completion: { label: 'Completed',  color: 'text-green-500',        bg: 'bg-green-500/15',      Icon: Trophy      },
  transport:  { label: 'Transport',  color: 'text-blue-400',         bg: 'bg-blue-400/15',       Icon: Car         },
  budget:     { label: 'Budget',     color: 'text-purple-400',       bg: 'bg-purple-400/15',     Icon: Wallet      },
  expense:    { label: 'Expense',    color: 'text-orange-400',       bg: 'bg-orange-400/15',     Icon: Receipt     },
  employment: { label: 'Employment', color: 'text-teal-400',         bg: 'bg-teal-400/15',       Icon: Bus         },
  snapshot:   { label: 'Summary',    color: 'text-sky-400',          bg: 'bg-sky-400/15',        Icon: Zap         },
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

// ─── Entry row (for All + Debts tabs) ─────────────────────────────────────────

function EntryRow({ entry, onUpdate, onDelete, showDebt = false }: {
  entry: HistoryEntry;
  onUpdate: (id: string, data: { label?: string; note?: string }) => void;
  onDelete: (id: string) => void;
  showDebt?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.label ?? '');
  const canEdit = entry.type === 'payment';

  const save = () => { onUpdate(entry.id, { label: draft.trim() || undefined }); setEditing(false); };
  const cancel = () => { setDraft(entry.label ?? ''); setEditing(false); };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0">
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
            className="h-8 text-sm w-44" autoFocus placeholder="e.g. Interest, Penalty" />
        ) : (
          <TypeBadge type={entry.type} label={entry.label} />
        )}
        {showDebt && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{entry.debtTitle}</p>}
        <p className="text-xs text-muted-foreground mt-1">{fmtDate(entry.date)}</p>
        {entry.note && <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{entry.note}</p>}
      </div>
      <span className="text-sm font-bold tabular-nums shrink-0">{formatCurrency(entry.amount)}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        {editing ? (
          <>
            <button onClick={save} className="p-2.5 rounded-xl text-green-500 active:bg-green-500/10"><Check size={15} /></button>
            <button onClick={cancel} className="p-2.5 rounded-xl text-muted-foreground active:bg-muted"><X size={15} /></button>
          </>
        ) : (
          <>
            {canEdit && (
              <button onClick={() => setEditing(true)} className="p-2.5 rounded-xl text-muted-foreground/50 active:bg-muted">
                <Pencil size={13} />
              </button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="p-2.5 rounded-xl text-muted-foreground/40 active:bg-destructive/10 active:text-destructive">
                  <Trash2 size={13} />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete entry?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently remove this history entry.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();
  const {
    history, debts, expenses, uberRides, budgetPlans,
    updateHistoryEntry, deleteHistoryEntry,
    userProfile, exportFolderUri, exportFolderName, setExportFolder, setAppError,
  } = useContext(AppDataContext);

  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [exportOpen, setExportOpen] = useState(false);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [confirmFmt, setConfirmFmt] = useState<ExportFormat | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const initials = getInitials(userProfile.name);

  // ── Swipe detection ─────────────────────────────────────────────────────────
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) < 50) return;
    const idx = TAB_ORDER.indexOf(activeTab);
    if (delta > 0 && idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
    if (delta < 0 && idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
    touchStartX.current = null;
  };

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
    const map = new Map<string, HistoryEntry[]>();
    for (const e of allSorted) {
      const key = format(new Date(e.date), 'MMMM yyyy');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [allSorted]);

  const sortedUber = useMemo(() => [...uberRides].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [uberRides]);
  const sortedExpenses = useMemo(() => [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [expenses]);

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

  // ── Download handler ──────────────────────────────────────────────────────────
  const handleDownload = async (fmt: ExportFormat) => {
    setConfirmFmt(null);
    const args: ExportBuilderArgs = { history, expenses, uberRides, budgetPlans, debts, userName: userProfile.name, tab: activeTab };
    try {
      let blob: Blob;
      const ext = fmt;
      if (fmt === 'pdf') blob = await buildPdf(args);
      else if (fmt === 'csv') blob = buildCsv(args);
      else blob = buildTxt(args);

      const filename = `${initials || 'U'}-${activeTab}-${buildDateStamp()}.${ext}`;
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        triggerDownload(blob, filename);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2500);
        return;
      }

      let uri = exportFolderUri;
      let folderName = exportFolderName || 'your folder';
      if (!uri) {
        const picked = await FolderAccess.pickFolder().catch(() => null);
        if (!picked) return;
        setExportFolder(picked.uri, picked.name || 'Selected folder');
        uri = picked.uri; folderName = picked.name;
      }

      const base64 = await blobToBase64(blob);
      await FolderAccess.saveFile({ folderUri: uri, name: filename, mimeType: blob.type || 'application/octet-stream', data: base64 });

      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.createChannel({ id: 'downloads', name: 'Downloads', description: 'File download notifications', importance: 3, visibility: 1 });
        await LocalNotifications.schedule({ notifications: [{ title: 'File Saved', body: `${filename} saved to ${folderName}`, id: (Date.now() % 100000) + 1000, channelId: 'downloads' }] });
      } catch { /* notification failure is non-fatal */ }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2500);
    } catch (err) {
      setAppError({ friendly: `Could not export ${fmt.toUpperCase()} file.`, operation: `handleDownload (${activeTab}/${fmt}) in HistoryPage`, error: err, ts: Date.now() });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.22 }}
      className="container mx-auto max-w-md pt-12 pb-10 px-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
            onClick={() => setActiveTab(tab)}
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

      {/* Summary pill */}
      <div className="bg-card rounded-2xl px-4 py-3.5 mb-3">
        <p className="text-lg font-black tabular-nums text-primary">{tabStats[activeTab].label}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{tabStats[activeTab].sub}</p>
      </div>

      {/* Export button */}
      <button
        onClick={() => setExportOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted/50 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <Download size={14} /> Export {TAB_LABELS[activeTab]}
      </button>

      {/* Content */}
      <div>

        {/* ALL TAB */}
        {activeTab === 'all' && (
          <div className="space-y-3">
            {monthGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center mt-24 gap-3 text-muted-foreground">
                <Receipt size={48} className="opacity-20" />
                <p className="text-sm">No history yet</p>
              </div>
            )}
            {monthGroups.map(([month, entries]) => (
              <Card key={month} className="overflow-hidden cv-auto">
                <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{month}</p>
                  <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                    {formatCurrency(entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0))} paid
                  </p>
                </div>
                <CardContent className="px-4 pb-2 pt-0">
                  {entries.map(entry => (
                    <EntryRow key={entry.id} entry={entry} onUpdate={updateHistoryEntry} onDelete={deleteHistoryEntry} showDebt />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* DEBTS TAB */}
        {activeTab === 'debts' && (
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
                      {isComplete && <span className="text-[9px] bg-green-500/15 text-green-500 px-1.5 py-0.5 rounded-full font-semibold">PAID OFF</span>}
                    </div>
                    {groupTotal > 0 && <p className="text-[10px] text-muted-foreground/60 tabular-nums">{formatCurrency(groupTotal)} paid</p>}
                  </div>
                  <CardContent className="px-4 pb-2 pt-0">
                    {items.map(entry => (
                      <EntryRow key={entry.id} entry={entry} onUpdate={updateHistoryEntry} onDelete={deleteHistoryEntry} />
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* TRANSPORT TAB */}
        {activeTab === 'transport' && (
          <div className="space-y-3">
            {transportEntries.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-4 pt-4 pb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Monthly Transport</p>
                </div>
                <CardContent className="px-4 pb-2 pt-0">
                  {transportEntries.map(entry => (
                    <EntryRow key={entry.id} entry={entry} onUpdate={updateHistoryEntry} onDelete={deleteHistoryEntry} />
                  ))}
                </CardContent>
              </Card>
            )}
            {sortedUber.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Uber Rides</p>
                  <p className="text-[10px] text-muted-foreground/60">{formatCurrency(sortedUber.reduce((s, r) => s + r.price, 0))} total</p>
                </div>
                <CardContent className="px-4 pb-2 pt-0">
                  {sortedUber.map(ride => (
                    <div key={ride.id} className="cv-auto flex items-center gap-3 py-3 border-b border-border/30 last:border-0">
                      <div className="flex-1 min-w-0">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-400/15 text-blue-400">
                          <Car size={10} /> Uber
                        </span>
                        {(ride.from || ride.to) && (
                          <p className="text-xs text-foreground mt-1 truncate">
                            {ride.from}{ride.from && ride.to ? ' → ' : ''}{ride.to}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtDate(ride.date)}{ride.distance ? ` · ${ride.distance}km` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0">{formatCurrency(ride.price)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {transportEntries.length === 0 && sortedUber.length === 0 && (
              <div className="flex flex-col items-center justify-center mt-24 gap-3 text-muted-foreground">
                <Car size={48} className="opacity-20" />
                <p className="text-sm">No transport history yet</p>
              </div>
            )}
          </div>
        )}

        {/* EXPENSES TAB */}
        {activeTab === 'expenses' && (
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
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-400/15 text-orange-400">
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
        {activeTab === 'budget' && (
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

      {/* Export dialog — step 1: pick format & folder */}
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tab={activeTab}
        initials={initials}
        exportFolderUri={exportFolderUri}
        exportFolderName={exportFolderName}
        onPickFolder={pickFolder}
        onConfirm={fmt => { setConfirmFmt(fmt); }}
      />

      {/* Confirm dialog — step 2: are you sure? */}
      <AlertDialog open={confirmFmt !== null} onOpenChange={v => { if (!v) setConfirmFmt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Download file?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmFmt && (
                <>
                  <span className="font-mono text-xs text-foreground">
                    {`${initials || 'U'}-${activeTab}-${buildDateStamp()}.${confirmFmt}`}
                  </span>
                  {' '}will be saved to your {exportFolderName || 'Downloads'} folder.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmFmt(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmFmt && handleDownload(confirmFmt)} className="gap-2">
              <Download className="h-4 w-4" /> Download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success toast — auto-dismisses after 2.5 s */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 inset-x-0 flex justify-center pointer-events-none z-50"
          >
            <div className="flex items-center gap-2 bg-card border border-border rounded-full px-5 py-2.5 shadow-lg text-sm font-semibold text-foreground">
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              File saved successfully
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
