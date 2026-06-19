'use client';

import { useContext, useRef, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppDataContext } from '@/context/AppDataContext';
import type { AppData } from '@/lib/types';
import { idbGet, idbSet } from '@/lib/utils';
import { FolderAccess } from '@/lib/folderAccess';
import { subMonths, isAfter } from 'date-fns';
import { Download, Upload, Trash2, Code, Sparkles, FileText, FileSpreadsheet, Sheet, BookOpen, Settings2, BarChart3, FolderOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
// Minimal duck-type for jsPDF instances — avoids a top-level import that Turbopack
// would process at module load time and fail on jsPDF's ES6 class `super` calls.
interface PDFDoc {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  addPage: () => PDFDoc;
  setFillColor: (r: string | number, g?: number, b?: number) => PDFDoc;
  setDrawColor: (r: string | number, g?: number, b?: number) => PDFDoc;
  setLineWidth: (w: number) => PDFDoc;
  rect: (x: number, y: number, w: number, h: number, style: string) => PDFDoc;
  setTextColor: (r: string | number, g?: number, b?: number) => PDFDoc;
  setFont: (font: string, style: string) => PDFDoc;
  setFontSize: (size: number) => PDFDoc;
  text: (text: string, x: number, y: number, opts?: { align?: string }) => PDFDoc;
  line: (x1: number, y1: number, x2: number, y2: number) => PDFDoc;
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-ZA'); } catch { return iso; }
}

function buildDateStamp(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function getInitials(name: string): string {
  const t = name.trim();
  if (!t) return 'U';
  return t.split(/\s+/).map(w => w[0].toUpperCase()).join('');
}

function buildFilename(initials: string, type: string, ext: string): string {
  return `${initials}-${type}-${buildDateStamp()}.${ext}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// PDF table & footer helpers (pure jsPDF — no extra dependencies)
// ──────────────────────────────────────────────────────────────────────────────

type ColDef = { header: string; width: number; align?: 'left' | 'right' };
type RowData = (string | number)[];

function drawTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  startY: number,
  cols: ColDef[],
  rows: RowData[],
  totalRow?: RowData,
  opts?: { leftMargin?: number; rowHeight?: number; fontSize?: number; pageBreakThreshold?: number }
): number {
  const LEFT = opts?.leftMargin ?? 10;
  const ROW_H = opts?.rowHeight ?? 7;
  const HDR_H = 8;
  const FS = opts?.fontSize ?? 8;
  const PB = opts?.pageBreakThreshold ?? 270;
  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  let y = startY;

  const drawHeader = () => {
    doc.setFillColor(45, 50, 58);
    doc.rect(LEFT, y, totalWidth, HDR_H, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS);
    let xCursor = LEFT;
    for (const col of cols) {
      if (col.align === 'right') {
        doc.text(col.header, xCursor + col.width - 1.5, y + HDR_H - 2, { align: 'right' });
      } else {
        doc.text(col.header, xCursor + 1.5, y + HDR_H - 2);
      }
      xCursor += col.width;
    }
    y += HDR_H;
  };

  if (y + HDR_H > PB) { doc.addPage(); y = 15; }
  drawHeader();

  for (let i = 0; i < rows.length; i++) {
    if (y + ROW_H > PB) {
      doc.addPage();
      y = 15;
      drawHeader();
    }
    if (i % 2 === 1) {
      doc.setFillColor(245, 246, 248);
      doc.rect(LEFT, y, totalWidth, ROW_H, 'F');
    }
    doc.setDrawColor(180, 185, 192);
    doc.setLineWidth(0.1);
    doc.rect(LEFT, y, totalWidth, ROW_H, 'S');
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS);
    let xCursor = LEFT;
    for (let c = 0; c < cols.length; c++) {
      const cell = String(rows[i][c] ?? '');
      const col = cols[c];
      if (col.align === 'right') {
        doc.text(cell, xCursor + col.width - 1.5, y + ROW_H - 2, { align: 'right' });
      } else {
        doc.text(cell, xCursor + 1.5, y + ROW_H - 2);
      }
      xCursor += col.width;
    }
    y += ROW_H;
  }

  if (totalRow) {
    if (y + HDR_H > PB) { doc.addPage(); y = 15; }
    doc.setFillColor(215, 220, 230);
    doc.rect(LEFT, y, totalWidth, HDR_H, 'F');
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS);
    let xCursor = LEFT;
    for (let c = 0; c < cols.length; c++) {
      const cell = String(totalRow[c] ?? '');
      const col = cols[c];
      if (col.align === 'right') {
        doc.text(cell, xCursor + col.width - 1.5, y + HDR_H - 2, { align: 'right' });
      } else {
        doc.text(cell, xCursor + 1.5, y + HDR_H - 2);
      }
      xCursor += col.width;
    }
    y += HDR_H;
  }

  return y;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawPageFooter(doc: any, pageNum: number, totalPages: number): void {
  const W = doc.internal.pageSize.getWidth();
  const footerY = doc.internal.pageSize.getHeight() - 8;
  doc.setDrawColor(180, 185, 192);
  doc.setLineWidth(0.3);
  doc.line(10, footerY - 3, W - 10, footerY - 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`Page ${pageNum} of ${totalPages}`, 10, footerY);
  doc.text('Duey Report', W - 10, footerY, { align: 'right' });
}

// ──────────────────────────────────────────────────────────────────────────────
// Period labels
// ──────────────────────────────────────────────────────────────────────────────

type StatsPeriod = '3m' | '6m' | 'all';

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '3m': 'Last 3 Months',
  '6m': 'Last 6 Months',
  'all': 'All Time',
};

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function DataManagementMenu() {
  const { getAppState, importData, clearData, setAppError, userProfile, exportFolderUri, exportFolderName, setExportFolder } = useContext(AppDataContext);
  const fullFileInputRef   = useRef<HTMLInputElement>(null);
  const configFileInputRef = useRef<HTMLInputElement>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [jsonString, setJsonString] = useState('');
  const [error, setError] = useState('');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [isNative, setIsNative] = useState(false);
  const [choosingFolder, setChoosingFolder] = useState(false);

  const initials = getInitials(userProfile.name);

  // Detect native platform once on mount (Capacitor.isNativePlatform is sync but core is dynamically imported elsewhere).
  useEffect(() => {
    import('@capacitor/core').then(({ Capacitor }) => setIsNative(Capacitor.isNativePlatform()));
  }, []);

  // Launch the system folder picker and remember the chosen location.
  // Returns { uri, name } on success, or null if the user cancelled.
  const chooseFolder = async (): Promise<{ uri: string; name: string } | null> => {
    setChoosingFolder(true);
    try {
      const res = await FolderAccess.pickFolder();
      const name = res.name || 'Selected folder';
      setExportFolder(res.uri, name);
      return { uri: res.uri, name };
    } catch {
      // User dismissed the picker — not an error.
      return null;
    } finally {
      setChoosingFolder(false);
    }
  };

  // ── Cross-platform download ──────────────────────────────────────────────────
  // Native: write to External app directory (Files app → Android/data/com.duey.app/files/Duey).
  // No share sheet, no extra permissions. Web: blob URL download.

  const notifySaved = async (filename: string, folderName: string) => {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.createChannel({
        id: 'downloads',
        name: 'Downloads',
        description: 'File download notifications',
        importance: 3,
        visibility: 1,
      });
      await LocalNotifications.schedule({
        notifications: [{
          title: 'File Saved',
          body: `${filename} saved to ${folderName}`,
          id: (Date.now() % 100000) + 1000,
          channelId: 'downloads',
        }],
      });
    } catch {
      // Notification failure should not block the export.
    }
  };

  const downloadFile = async (blob: Blob, filename: string) => {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      triggerDownload(blob, filename);
      return;
    }

    // First export (or grant was revoked): ask the user to pick a folder once.
    // The system picker handles permission AND location, and lists SD card / internal automatically.
    let uri = exportFolderUri;
    let folderName = exportFolderName || 'your folder';
    if (!uri) {
      const picked = await chooseFolder();
      if (!picked) return; // user cancelled
      uri = picked.uri;
      folderName = picked.name;
    }

    try {
      const base64 = await blobToBase64(blob);
      try {
        await FolderAccess.saveFile({
          folderUri: uri,
          name: filename,
          mimeType: blob.type || 'application/octet-stream',
          data: base64,
        });
      } catch (saveErr) {
        // Grant lost (folder deleted / SD card removed / permission cleared) → re-pick once.
        const repicked = await chooseFolder();
        if (!repicked) {
          setAppError({
            friendly: `Couldn't access your export folder. Choose a new one and try again.`,
            operation: 'FolderAccess.saveFile (retry) in DataManagementMenu',
            error: saveErr,
            ts: Date.now(),
          });
          return;
        }
        await FolderAccess.saveFile({
          folderUri: repicked.uri,
          name: filename,
          mimeType: blob.type || 'application/octet-stream',
          data: base64,
        });
        folderName = repicked.name;
      }
      await notifySaved(filename, folderName);
    } catch (err) {
      setAppError({
        friendly: `Could not save ${filename} — storage may be unavailable.`,
        operation: 'downloadFile (native) in DataManagementMenu',
        error: err,
        ts: Date.now(),
      });
    }
  };

  // ── History exports ─────────────────────────────────────────────────────────

  const exportAsTxt = async () => {
    try {
      const s = getAppState();
      const lines: string[] = [
        'DUEY — History Export',
        `Generated: ${new Date().toLocaleDateString('en-ZA')}`,
        '',
        '=== DEBTS ===',
      ];
      const debtHistory = s.history.filter(h => h.type === 'creation' || h.type === 'payment' || h.type === 'completion');
      const byDebt = debtHistory.reduce<Record<string, typeof debtHistory>>((acc, h) => {
        const key = h.debtTitle;
        if (!acc[key]) acc[key] = [];
        acc[key].push(h);
        return acc;
      }, {});
      for (const [name, entries] of Object.entries(byDebt)) {
        lines.push(`\n${name}`);
        for (const e of entries) {
          if (e.type === 'creation')   lines.push(`  Created R${e.amount} on ${formatDate(e.date)}`);
          else if (e.type === 'payment')    lines.push(`  Paid R${e.amount} on ${formatDate(e.date)}`);
          else if (e.type === 'completion') lines.push(`  COMPLETED R${e.amount} on ${formatDate(e.date)}`);
        }
      }
      lines.push('', '=== TRANSPORT ===');
      s.history.filter(h => h.type === 'transport').forEach(h => {
        lines.push(`  ${h.debtTitle} — R${h.amount} on ${formatDate(h.date)}`);
      });
      lines.push('', '=== UBER RIDES ===');
      s.uberRides.forEach(r => {
        lines.push(`  ${formatDate(r.date)} — R${r.price}${r.from ? ` from ${r.from}` : ''}${r.to ? ` to ${r.to}` : ''}${r.distance ? ` (${r.distance}km)` : ''}`);
      });
      lines.push('', '=== BUDGET PLANS ===');
      s.budgetPlans.forEach(p => {
        const spent = p.items.reduce((s, i) => s + i.price, 0);
        lines.push(`\n  ${p.name} — Budget R${p.budget}, Spent R${spent}`);
        p.items.forEach(i => lines.push(`    - ${i.name}: R${i.price}${i.link ? ` (${i.link})` : ''}`));
      });
      await downloadFile(new Blob([lines.join('\n')], { type: 'text/plain' }), buildFilename(initials, 'history', 'txt'));
    } catch (err) {
      setAppError({ friendly: 'Could not export text file.', operation: 'exportAsTxt in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  const exportAsCsv = async () => {
    try {
      const s = getAppState();
      const rows: string[][] = [['Date', 'Type', 'Name', 'Amount (R)', 'Notes']];
      s.history.forEach(h => rows.push([formatDate(h.date), h.type, h.debtTitle, String(h.amount), h.note ?? '']));
      s.uberRides.forEach(r => rows.push([formatDate(r.date), 'uber', `${r.from ?? ''} → ${r.to ?? ''}`, String(r.price), r.distance ? `${r.distance}km` : '']));
      s.budgetPlans.forEach(p => p.items.forEach(i => rows.push([formatDate(i.createdAt), 'budget-item', `${p.name}: ${i.name}`, String(i.price), i.link ?? ''])));
      const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      await downloadFile(new Blob([csv], { type: 'text/csv' }), buildFilename(initials, 'history', 'csv'));
    } catch (err) {
      setAppError({ friendly: 'Could not export CSV file.', operation: 'exportAsCsv in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  const exportAsExcel = async () => {
    try {
      const s = getAppState();
      const { utils, write } = await import('xlsx');
      const wb = utils.book_new();

      const historySheet = utils.json_to_sheet(s.history.map(h => ({ Date: formatDate(h.date), Type: h.type, Name: h.debtTitle, 'Amount (R)': h.amount, Notes: h.note ?? '' })));
      historySheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 30 }];
      utils.book_append_sheet(wb, historySheet, 'History');

      const uberSheet = utils.json_to_sheet(s.uberRides.map(r => ({ Date: formatDate(r.date), From: r.from ?? '', To: r.to ?? '', 'Price (R)': r.price, 'Distance (km)': r.distance ?? '' })));
      uberSheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 14 }];
      utils.book_append_sheet(wb, uberSheet, 'Uber Rides');

      const budgetSheet = utils.json_to_sheet(s.budgetPlans.flatMap(p => p.items.map(i => ({ Plan: p.name, Budget: p.budget, Item: i.name, 'Price (R)': i.price, Link: i.link ?? '' }))));
      budgetSheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 40 }];
      utils.book_append_sheet(wb, budgetSheet, 'Budget Plans');

      const data = write(wb, { bookType: 'xlsx', type: 'array' });
      await downloadFile(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), buildFilename(initials, 'history', 'xlsx'));
    } catch (err) {
      setAppError({ friendly: 'Could not export Excel file.', operation: 'exportAsExcel in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  const exportAsWord = async () => {
    try {
      const s = getAppState();
      const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, Packer, WidthType } = await import('docx');
      const dateStr = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });

      const HDR_FILL = '2D323A';
      const COL_DATE = 1440;
      const COL_NAME = 5760;
      const COL_AMT  = 1440;

      type DocCell = InstanceType<typeof TableCell>;
      type DocRow  = InstanceType<typeof TableRow>;

      const makeHdrCell = (text: string, width: number): DocCell =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })] })],
          shading: { fill: HDR_FILL, type: 'solid' },
          width: { size: width, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
        });

      const makeDataCell = (text: string, width: number): DocCell =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text, size: 18 })] })],
          width: { size: width, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
        });

      const make3ColTable = (
        headers: [string, string, string],
        dataRows: [string, string, string][],
        widths: [number, number, number] = [COL_DATE, COL_NAME, COL_AMT]
      ) => new Table({
        width: { size: 8640, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: headers.map((h, i) => makeHdrCell(h, widths[i])) as DocCell[],
            tableHeader: true,
          }),
          ...dataRows.map(([a, b, c]) => new TableRow({
            children: [
              makeDataCell(a, widths[0]),
              makeDataCell(b, widths[1]),
              makeDataCell(c, widths[2]),
            ] as DocCell[],
          })) as DocRow[],
        ],
      });

      const debtEntries = s.history.filter(h => ['creation', 'payment', 'completion'].includes(h.type));
      const transportEntries = s.history.filter(h => h.type === 'transport');

      const uberTable = new Table({
        width: { size: 8640, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              makeHdrCell('Date', 1440),
              makeHdrCell('Route', 4320),
              makeHdrCell('km', 1440),
              makeHdrCell('Amount (R)', 1440),
            ] as DocCell[],
            tableHeader: true,
          }),
          ...s.uberRides.map(r => new TableRow({
            children: [
              makeDataCell(formatDate(r.date), 1440),
              makeDataCell(r.from && r.to ? `${r.from} → ${r.to}` : (r.from ?? r.to ?? '—'), 4320),
              makeDataCell(r.distance ? String(r.distance) : '—', 1440),
              makeDataCell(`R ${r.price.toFixed(2)}`, 1440),
            ] as DocCell[],
          })) as DocRow[],
        ],
      });

      const budgetSections: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
      for (const plan of s.budgetPlans) {
        const spent = plan.items.reduce((a, i) => a + i.price, 0);
        budgetSections.push(
          new Paragraph({ text: `${plan.name}  (Budget: R ${plan.budget.toFixed(2)}, Spent: R ${spent.toFixed(2)})`, heading: HeadingLevel.HEADING_2 })
        );
        budgetSections.push(new Table({
          width: { size: 8640, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [makeHdrCell('Item', 7200), makeHdrCell('Price (R)', 1440)] as DocCell[], tableHeader: true }),
            ...plan.items.map(i => new TableRow({
              children: [makeDataCell(i.name, 7200), makeDataCell(`R ${i.price.toFixed(2)}`, 1440)] as DocCell[],
            })) as DocRow[],
          ],
        }));
        budgetSections.push(new Paragraph({ text: '' }));
      }

      const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
        new Paragraph({ text: 'DUEY — History Report', heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun(`Generated: ${dateStr}`)] }),
        ...(s.userProfile.name ? [new Paragraph({ children: [new TextRun(`Prepared for: ${s.userProfile.name}`)] })] : []),
        new Paragraph({ text: '' }),
        ...(debtEntries.length > 0 ? [
          new Paragraph({ text: 'Debt Payments', heading: HeadingLevel.HEADING_1 }),
          make3ColTable(
            ['Date', 'Debt / Description', 'Amount (R)'],
            debtEntries.map(h => [formatDate(h.date), h.debtTitle + (h.type !== 'payment' ? ` (${h.type})` : ''), `R ${h.amount.toFixed(2)}`] as [string, string, string])
          ),
          new Paragraph({ text: '' }),
        ] : []),
        ...(transportEntries.length > 0 ? [
          new Paragraph({ text: 'Transport', heading: HeadingLevel.HEADING_1 }),
          make3ColTable(
            ['Date', 'Description', 'Amount (R)'],
            transportEntries.map(h => [formatDate(h.date), h.debtTitle, `R ${h.amount.toFixed(2)}`] as [string, string, string])
          ),
          new Paragraph({ text: '' }),
        ] : []),
        ...(s.uberRides.length > 0 ? [
          new Paragraph({ text: 'Uber Rides', heading: HeadingLevel.HEADING_1 }),
          uberTable,
          new Paragraph({ text: '' }),
        ] : []),
        ...(s.budgetPlans.length > 0 ? [
          new Paragraph({ text: 'Budget Plans', heading: HeadingLevel.HEADING_1 }),
          ...budgetSections,
        ] : []),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await downloadFile(
        await Packer.toBlob(new Document({ sections: [{ children: children as any[] }] })),
        buildFilename(initials, 'history', 'docx')
      );
    } catch (err) {
      setAppError({ friendly: 'Could not export Word document.', operation: 'exportAsWord in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  const exportAsPdf = async () => {
    try {
      const s = getAppState();
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const PAGE_W = doc.internal.pageSize.getWidth();
      const dateStr = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });

      const DEBT_COLS: ColDef[]      = [{ header: 'Date', width: 28 }, { header: 'Debt / Description', width: 110 }, { header: 'Amount (R)', width: 52, align: 'right' }];
      const TRANSPORT_COLS: ColDef[] = [{ header: 'Date', width: 28 }, { header: 'Description', width: 110 }, { header: 'Amount (R)', width: 52, align: 'right' }];
      const UBER_COLS: ColDef[]      = [{ header: 'Date', width: 28 }, { header: 'Route', width: 92 }, { header: 'km', width: 22, align: 'right' }, { header: 'Amount (R)', width: 48, align: 'right' }];
      const BUDGET_COLS: ColDef[]    = [{ header: 'Item', width: 138 }, { header: 'Amount (R)', width: 52, align: 'right' }];

      let y = 18;

      // Page header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(30, 30, 30);
      doc.text('DUEY', 10, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(dateStr, PAGE_W - 10, y, { align: 'right' });
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text('History Report', 10, y);
      y += 5;
      doc.setDrawColor(180, 185, 192);
      doc.setLineWidth(0.4);
      doc.line(10, y, PAGE_W - 10, y);
      y += 7;

      const sectionHeader = (title: string) => {
        if (y + 8 > 270) { doc.addPage(); y = 15; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(45, 50, 58);
        doc.text(title, 10, y);
        y += 5;
      };

      // Debt payments
      const debtEntries = s.history.filter(h => ['payment', 'creation', 'completion'].includes(h.type));
      if (debtEntries.length > 0) {
        sectionHeader('DEBT PAYMENTS');
        const paymentRows: RowData[] = debtEntries.map(h => [
          formatDate(h.date),
          h.debtTitle + (h.type !== 'payment' ? ` (${h.type})` : ''),
          `R  ${h.amount.toFixed(2)}`,
        ]);
        const totalPaid = s.history.filter(h => h.type === 'payment').reduce((a, h) => a + h.amount, 0);
        y = drawTable(doc, y, DEBT_COLS, paymentRows, ['', 'Total Paid', `R  ${totalPaid.toFixed(2)}`]);
        y += 6;
      }

      // Transport
      const transportEntries = s.history.filter(h => h.type === 'transport');
      if (transportEntries.length > 0) {
        sectionHeader('TRANSPORT');
        const transportRows: RowData[] = transportEntries.map(h => [formatDate(h.date), h.debtTitle, `R  ${h.amount.toFixed(2)}`]);
        const totalTrans = transportEntries.reduce((a, h) => a + h.amount, 0);
        y = drawTable(doc, y, TRANSPORT_COLS, transportRows, ['', 'Total', `R  ${totalTrans.toFixed(2)}`]);
        y += 6;
      }

      // Uber rides
      if (s.uberRides.length > 0) {
        sectionHeader('UBER RIDES');
        const uberRows: RowData[] = s.uberRides.map(r => {
          const route = r.from && r.to ? `${r.from} → ${r.to}` : (r.from ?? r.to ?? '—');
          return [formatDate(r.date), route, r.distance ? String(r.distance) : '—', `R  ${r.price.toFixed(2)}`];
        });
        const totalUber = s.uberRides.reduce((a, r) => a + r.price, 0);
        y = drawTable(doc, y, UBER_COLS, uberRows, ['', '', '', `R  ${totalUber.toFixed(2)}`]);
        y += 6;
      }

      // Budget plans
      if (s.budgetPlans.length > 0) {
        sectionHeader('BUDGET PLANS');
        for (const plan of s.budgetPlans) {
          if (y + 8 > 270) { doc.addPage(); y = 15; }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(60, 60, 60);
          doc.text(`${plan.name}  (Budget: R ${plan.budget.toFixed(2)})`, 10, y);
          y += 4;
          const planRows: RowData[] = plan.items.map(i => [i.name, `R  ${i.price.toFixed(2)}`]);
          const planTotal = plan.items.reduce((a, i) => a + i.price, 0);
          y = drawTable(doc, y, BUDGET_COLS, planRows, ['Total Spent', `R  ${planTotal.toFixed(2)}`]);
          y += 4;
        }
      }

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) { doc.setPage(i); drawPageFooter(doc, i, totalPages); }

      await downloadFile(doc.output('blob'), buildFilename(initials, 'history', 'pdf'));
    } catch (err) {
      setAppError({ friendly: 'Could not export PDF.', operation: 'exportAsPdf in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  // ── Financial Statement export ───────────────────────────────────────────────

  const exportStatsPdf = async () => {
    try {
      const s = getAppState();
      const cutoff = statsPeriod === '3m' ? subMonths(new Date(), 3)
                   : statsPeriod === '6m' ? subMonths(new Date(), 6)
                   : new Date(0);
      const periodLabel = PERIOD_LABELS[statsPeriod];
      const fHist  = s.history.filter(h => isAfter(new Date(h.date), cutoff));
      const fRides = s.uberRides.filter(r => isAfter(new Date(r.date), cutoff));

      const payments   = fHist.filter(h => h.type === 'payment');
      const transport  = fHist.filter(h => h.type === 'transport');
      const totalPaid  = payments.reduce((a, h) => a + h.amount, 0);
      const totalTrans = transport.reduce((a, h) => a + h.amount, 0);
      const totalUber  = fRides.reduce((a, r) => a + r.price, 0);

      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const PAGE_W = doc.internal.pageSize.getWidth();
      const dateStr = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });

      const DEBT_COLS: ColDef[]      = [{ header: 'Date', width: 28 }, { header: 'Debt / Description', width: 110 }, { header: 'Amount (R)', width: 52, align: 'right' }];
      const TRANSPORT_COLS: ColDef[] = [{ header: 'Date', width: 28 }, { header: 'Description', width: 110 }, { header: 'Amount (R)', width: 52, align: 'right' }];
      const UBER_COLS: ColDef[]      = [{ header: 'Date', width: 28 }, { header: 'Route', width: 92 }, { header: 'km', width: 22, align: 'right' }, { header: 'Amount (R)', width: 48, align: 'right' }];
      const SUMMARY_COLS: ColDef[]   = [{ header: 'Category', width: 138 }, { header: 'Total (R)', width: 52, align: 'right' }];

      let y = 18;

      // Cover header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(30, 30, 30);
      doc.text('DUEY Financial Statement', 10, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(`Period: ${periodLabel}`, 10, y);
      y += 5;
      doc.text(`Generated: ${dateStr}`, 10, y);
      y += 5;
      doc.setDrawColor(180, 185, 192);
      doc.setLineWidth(0.4);
      doc.line(10, y, PAGE_W - 10, y);
      y += 7;

      const sectionHeader = (title: string) => {
        if (y + 8 > 270) { doc.addPage(); y = 15; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(45, 50, 58);
        doc.text(title, 10, y);
        y += 5;
      };

      const emptyNote = (msg: string) => {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(130, 130, 130);
        doc.text(msg, 12, y);
        y += 6;
      };

      // Debt payments
      sectionHeader('DEBT PAYMENTS');
      if (payments.length > 0) {
        const payRows: RowData[] = payments.map(h => [formatDate(h.date), h.debtTitle, `R  ${h.amount.toFixed(2)}`]);
        y = drawTable(doc, y, DEBT_COLS, payRows, ['', 'Subtotal', `R  ${totalPaid.toFixed(2)}`]);
      } else {
        emptyNote('No payments in this period.');
      }
      y += 6;

      // Transport
      sectionHeader('TRANSPORT');
      if (transport.length > 0) {
        const transRows: RowData[] = transport.map(h => [formatDate(h.date), h.debtTitle, `R  ${h.amount.toFixed(2)}`]);
        y = drawTable(doc, y, TRANSPORT_COLS, transRows, ['', 'Subtotal', `R  ${totalTrans.toFixed(2)}`]);
      } else {
        emptyNote('No transport entries in this period.');
      }
      y += 6;

      // Uber rides
      sectionHeader('UBER RIDES');
      if (fRides.length > 0) {
        const uberRows: RowData[] = fRides.map(r => {
          const route = r.from && r.to ? `${r.from} → ${r.to}` : (r.from ?? r.to ?? '—');
          return [formatDate(r.date), route, r.distance ? String(r.distance) : '—', `R  ${r.price.toFixed(2)}`];
        });
        y = drawTable(doc, y, UBER_COLS, uberRows, ['', '', '', `R  ${totalUber.toFixed(2)}`]);
      } else {
        emptyNote('No Uber rides in this period.');
      }
      y += 6;

      // Summary
      sectionHeader('SUMMARY');
      const summaryRows: RowData[] = [
        ['Debt Payments', `R  ${totalPaid.toFixed(2)}`],
        ['Transport',     `R  ${totalTrans.toFixed(2)}`],
        ['Uber Rides',    `R  ${totalUber.toFixed(2)}`],
      ];
      y = drawTable(doc, y, SUMMARY_COLS, summaryRows, ['Grand Total', `R  ${(totalPaid + totalTrans + totalUber).toFixed(2)}`]);

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) { doc.setPage(i); drawPageFooter(doc, i, totalPages); }

      await downloadFile(doc.output('blob'), buildFilename(initials, `statement-${statsPeriod}`, 'pdf'));
    } catch (err) {
      setAppError({ friendly: 'Could not export PDF statement.', operation: 'exportStatsPdf in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  const exportStatsExcel = async () => {
    try {
      const s = getAppState();
      const cutoff = statsPeriod === '3m' ? subMonths(new Date(), 3)
                   : statsPeriod === '6m' ? subMonths(new Date(), 6)
                   : new Date(0);
      const fHist  = s.history.filter(h => isAfter(new Date(h.date), cutoff));
      const fRides = s.uberRides.filter(r => isAfter(new Date(r.date), cutoff));

      const { utils, write } = await import('xlsx');
      const wb = utils.book_new();

      const paymentsSheet = utils.json_to_sheet(
        fHist.filter(h => h.type === 'payment').map(h => ({ Date: formatDate(h.date), Debt: h.debtTitle, 'Amount (R)': h.amount }))
      );
      paymentsSheet['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 14 }];
      utils.book_append_sheet(wb, paymentsSheet, 'Debt Payments');

      const transportSheet = utils.json_to_sheet(
        fHist.filter(h => h.type === 'transport').map(h => ({ Date: formatDate(h.date), Description: h.debtTitle, 'Amount (R)': h.amount }))
      );
      transportSheet['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 14 }];
      utils.book_append_sheet(wb, transportSheet, 'Transport');

      const uberSheet = utils.json_to_sheet(
        fRides.map(r => ({ Date: formatDate(r.date), From: r.from ?? '', To: r.to ?? '', 'Price (R)': r.price, 'Distance (km)': r.distance ?? '' }))
      );
      uberSheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 14 }];
      utils.book_append_sheet(wb, uberSheet, 'Uber Rides');

      const totalPaid  = fHist.filter(h => h.type === 'payment').reduce((a, h) => a + h.amount, 0);
      const totalTrans = fHist.filter(h => h.type === 'transport').reduce((a, h) => a + h.amount, 0);
      const totalUber  = fRides.reduce((a, r) => a + r.price, 0);
      const summarySheet = utils.json_to_sheet([
        { Category: 'Debt Payments', 'Total (R)': totalPaid },
        { Category: 'Transport',     'Total (R)': totalTrans },
        { Category: 'Uber Rides',    'Total (R)': totalUber },
        { Category: 'Grand Total',   'Total (R)': totalPaid + totalTrans + totalUber },
      ]);
      summarySheet['!cols'] = [{ wch: 20 }, { wch: 14 }];
      utils.book_append_sheet(wb, summarySheet, 'Summary');

      const data = write(wb, { bookType: 'xlsx', type: 'array' });
      await downloadFile(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), buildFilename(initials, `statement-${statsPeriod}`, 'xlsx'));
    } catch (err) {
      setAppError({ friendly: 'Could not export Excel statement.', operation: 'exportStatsExcel in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  // ── User Config export / import ──────────────────────────────────────────────

  const exportUserConfig = async () => {
    try {
      const s = getAppState();
      const backgroundImage = await idbGet<string>('backgroundImage') ?? '';
      const avatarImage = await idbGet<string>('profileAvatar') ?? '';
      const configBlob = new Blob([JSON.stringify({
        type: 'duey-config',
        v: 1,
        exportedAt: new Date().toISOString(),
        themeSettings: s.themeSettings,
        userProfile: s.userProfile,
        notificationSettings: s.notificationSettings,
        userThemes: s.userThemes,
        backgroundImage,
        avatarImage,
      }, null, 2)], { type: 'application/json' });
      await downloadFile(configBlob, buildFilename(initials, 'config', 'json'));
    } catch (err) {
      setAppError({ friendly: 'Could not export config — storage may be unavailable.', operation: 'exportUserConfig in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  const handleConfigImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = e.target?.result;
        if (typeof raw !== 'string') { setError('Could not read config file.'); return; }
        const data = JSON.parse(raw);
        if (data.type !== 'duey-config') {
          setError('Not a valid Duey config file.');
          return;
        }
        const partial: AppData = {};
        if (data.themeSettings)        partial.themeSettings        = data.themeSettings;
        if (data.userProfile)          partial.userProfile          = data.userProfile;
        if (data.notificationSettings) partial.notificationSettings = data.notificationSettings;
        if (data.userThemes)           partial.userThemes           = data.userThemes;
        importData(partial);
        try {
          if (data.backgroundImage) await idbSet('backgroundImage', data.backgroundImage);
          if (data.avatarImage)     await idbSet('profileAvatar', data.avatarImage);
        } catch (idbErr) {
          setAppError({ friendly: 'Config imported but images could not be saved — storage may be full.', operation: 'idbSet in handleConfigImport in DataManagementMenu', error: idbErr, ts: Date.now() });
        }
        setTimeout(() => window.location.reload(), 600);
      } catch {
        setError('Failed to read config file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // ── Full backup ──────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const dataStr = JSON.stringify(getAppState(), null, 2);
      await downloadFile(new Blob([dataStr], { type: 'application/json' }), buildFilename(initials, 'backup', 'json'));
    } catch (err) {
      setAppError({ friendly: 'Could not export backup.', operation: 'handleExport in DataManagementMenu', error: err, ts: Date.now() });
    }
  };

  const handleImportClick = () => fullFileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = e.target?.result;
          if (typeof raw !== 'string') { setError('Could not read file.'); return; }
          importData(JSON.parse(raw));
        } catch {
          setError('Invalid backup file format.');
        }
      };
      reader.onerror = () => setError('Failed to read file.');
      reader.readAsText(file);
      event.target.value = '';
    }
  };

  const openEditor = () => {
    setJsonString(JSON.stringify(getAppState(), null, 2));
    setIsEditorOpen(true);
    setError('');
  };

  const handleSaveChanges = () => {
    try {
      setError('');
      const newState: AppData = JSON.parse(jsonString);
      if (!newState.debts || !Array.isArray(newState.debts))     throw new Error("'debts' array is missing or invalid.");
      if (!newState.history || !Array.isArray(newState.history)) throw new Error("'history' array is missing or invalid.");
      if (!newState.themeSettings || typeof newState.themeSettings !== 'object') throw new Error("'themeSettings' missing.");
      importData(newState);
      setTimeout(() => window.location.reload(), 1000);
      setIsEditorOpen(false);
    } catch (e: unknown) {
      setError(`Validation Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handlePrettify = () => {
    try { setError(''); setJsonString(JSON.stringify(JSON.parse(jsonString), null, 2)); }
    catch { setError('Cannot prettify invalid JSON.'); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Export Folder — native only; web always uses the browser's Downloads */}
      {isNative && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Export Folder</p>
            <p className="text-[10px] text-muted-foreground/70">
              Choose once where exports go — internal storage, SD card or USB. Every export saves there automatically.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0 rounded-lg bg-muted/40 px-3 py-2">
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className={cn('text-xs font-medium truncate', !exportFolderUri && 'text-muted-foreground/60 italic')}>
                  {exportFolderUri ? (exportFolderName || 'Selected folder') : 'No folder chosen'}
                </span>
              </div>
              <Button
                size="sm"
                variant={exportFolderUri ? 'ghost' : 'default'}
                className="shrink-0 text-xs h-9"
                disabled={choosingFolder}
                onClick={chooseFolder}
              >
                {choosingFolder ? 'Opening…' : exportFolderUri ? 'Change' : 'Choose'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50">
              Naming: {initials || 'U'}-type-DD-MM-YYYY.ext &nbsp;·&nbsp; e.g. {buildFilename(initials || 'U', 'backup', 'json')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Export History */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Export History</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={exportAsTxt}   variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <FileText className="h-3.5 w-3.5" /> Text (.txt)
            </Button>
            <Button onClick={exportAsCsv}   variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV (.csv)
            </Button>
            <Button onClick={exportAsExcel} variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <Sheet className="h-3.5 w-3.5" /> Excel (.xlsx)
            </Button>
            <Button onClick={exportAsWord}  variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <BookOpen className="h-3.5 w-3.5" /> Word (.docx)
            </Button>
            <Button onClick={exportAsPdf}   variant="secondary" size="sm" className="justify-start gap-2 text-xs col-span-2">
              <FileText className="h-3.5 w-3.5" /> PDF (.pdf)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User Config */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">User Config</p>
          <p className="text-[10px] text-muted-foreground/70">Theme, colors, fonts, background image, profile — transfer between devices</p>
          <div className="space-y-2 pt-1">
            <Button onClick={exportUserConfig} className="w-full justify-start h-auto p-3 text-left">
              <Settings2 className="mr-3 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Export Config</p>
                <p className="font-normal text-[10px] text-primary-foreground/80">Save theme &amp; profile settings</p>
              </div>
            </Button>
            <Button onClick={() => configFileInputRef.current?.click()} variant="secondary" className="w-full justify-start h-auto p-3 text-left">
              <Upload className="mr-3 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Import Config</p>
                <p className="font-normal text-[10px] text-secondary-foreground/80">Restore theme &amp; profile from config file</p>
              </div>
            </Button>
            <input ref={configFileInputRef} type="file" accept=".json,application/json" onChange={handleConfigImport} className="hidden" />
          </div>
        </CardContent>
      </Card>

      {/* Financial Statement */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Financial Statement</p>
          <p className="text-[10px] text-muted-foreground/70">Detailed report of payments, transport and Uber — like a bank statement</p>
          <div className="flex gap-2">
            {(['3m', '6m', 'all'] as StatsPeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setStatsPeriod(p)}
                className={cn(
                  'flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors',
                  statsPeriod === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/40'
                )}
              >
                {p === 'all' ? 'All Time' : p === '3m' ? '3 Months' : '6 Months'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={exportStatsPdf}   variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <BarChart3 className="h-3.5 w-3.5" /> PDF Statement
            </Button>
            <Button onClick={exportStatsExcel} variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <Sheet className="h-3.5 w-3.5" /> Excel Statement
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Full Backup */}
      <Card>
        <CardContent className="p-2 space-y-2">
          <Button onClick={handleExport} className="w-full justify-start h-auto p-3 text-left">
            <Download className="mr-3 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Export Full Backup</p>
              <p className="font-normal text-[10px] text-primary-foreground/80">Save a complete backup of all data</p>
            </div>
          </Button>
          <Button onClick={handleImportClick} variant="secondary" className="w-full justify-start h-auto p-3 text-left">
            <Upload className="mr-3 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Import Data</p>
              <p className="font-normal text-[10px] text-secondary-foreground/80">Restore from a backup file</p>
            </div>
          </Button>
          <input ref={fullFileInputRef} type="file" accept=".json,application/json" onChange={handleFileChange} className="hidden" />
        </CardContent>
      </Card>

      {/* Developer Mode */}
      <Card>
        <CardContent className="p-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="w-full justify-start h-auto p-3 text-left">
                <Code className="mr-3 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Developer Mode</p>
                  <p className="font-normal text-[10px] text-muted-foreground">Edit raw application state</p>
                </div>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Enter Developer Mode?</AlertDialogTitle>
                <AlertDialogDescription>Manual changes to raw data can break the app. Advanced users only.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={openEditor}>Enter</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {error && <p className="text-xs text-destructive px-1">{error}</p>}

      <div className="pt-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full h-9 text-xs">
              <Trash2 className="mr-2 h-4 w-4" /> Reset All Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone. All app data will be permanently deleted.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clearData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Everything</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Developer JSON editor dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex justify-between items-center">
              <DialogTitle>Raw Application State (JSON)</DialogTitle>
              <Button variant="outline" size="sm" onClick={handlePrettify}><Sparkles className="mr-2 h-4 w-4" />Prettify</Button>
            </div>
          </DialogHeader>
          <Textarea
            value={jsonString}
            onChange={e => setJsonString(e.target.value)}
            className="h-[60vh] font-mono text-xs"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
            <Button onClick={handleSaveChanges}>Validate &amp; Push Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
