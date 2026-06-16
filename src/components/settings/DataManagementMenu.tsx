'use client';

import { useContext, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppDataContext } from '@/context/AppDataContext';
import type { AppData } from '@/lib/types';
import { idbGet, idbSet } from '@/lib/utils';
import { subMonths, isAfter } from 'date-fns';
import { Download, Upload, Trash2, Code, Sparkles, FileText, FileSpreadsheet, Sheet, BookOpen, Settings2, BarChart3 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-ZA'); } catch { return iso; }
}

type StatsPeriod = '3m' | '6m' | 'all';

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '3m': 'Last 3 Months',
  '6m': 'Last 6 Months',
  'all': 'All Time',
};

export function DataManagementMenu() {
  const { getAppState, importData, clearData } = useContext(AppDataContext);
  const fullFileInputRef   = useRef<HTMLInputElement>(null);
  const configFileInputRef = useRef<HTMLInputElement>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [jsonString, setJsonString] = useState('');
  const [error, setError] = useState('');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');

  // ──────────────────────────────────────────────────────────────
  // History exports (existing)
  // ──────────────────────────────────────────────────────────────

  const exportAsTxt = () => {
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
    triggerDownload(new Blob([lines.join('\n')], { type: 'text/plain' }), 'duey-history.txt');
  };

  const exportAsCsv = () => {
    const s = getAppState();
    const rows: string[][] = [['Date', 'Type', 'Name', 'Amount (R)', 'Notes']];
    s.history.forEach(h => rows.push([formatDate(h.date), h.type, h.debtTitle, String(h.amount), '']));
    s.uberRides.forEach(r => rows.push([formatDate(r.date), 'uber', `${r.from ?? ''} → ${r.to ?? ''}`, String(r.price), r.distance ? `${r.distance}km` : '']));
    s.budgetPlans.forEach(p => p.items.forEach(i => rows.push([formatDate(i.createdAt), 'budget-item', `${p.name}: ${i.name}`, String(i.price), i.link ?? ''])));
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    triggerDownload(new Blob([csv], { type: 'text/csv' }), 'duey-history.csv');
  };

  const exportAsExcel = async () => {
    const s = getAppState();
    const { utils, writeFile } = await import('xlsx');
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.json_to_sheet(s.history.map(h => ({ Date: formatDate(h.date), Type: h.type, Name: h.debtTitle, Amount: h.amount }))), 'History');
    utils.book_append_sheet(wb, utils.json_to_sheet(s.uberRides.map(r => ({ Date: formatDate(r.date), From: r.from ?? '', To: r.to ?? '', Price: r.price, Distance_km: r.distance ?? '' }))), 'Uber Rides');
    utils.book_append_sheet(wb, utils.json_to_sheet(s.budgetPlans.flatMap(p => p.items.map(i => ({ Plan: p.name, Budget: p.budget, Item: i.name, Price: i.price, Link: i.link ?? '' })))), 'Budget Plans');
    writeFile(wb, 'duey-history.xlsx');
  };

  const exportAsWord = async () => {
    const s = getAppState();
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx');
    const children: InstanceType<typeof Paragraph>[] = [
      new Paragraph({ text: 'DUEY — History Export', heading: HeadingLevel.TITLE }),
      new Paragraph({ text: `Generated: ${new Date().toLocaleDateString('en-ZA')}` }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'Debts', heading: HeadingLevel.HEADING_1 }),
    ];
    s.history.filter(h => ['creation','payment','completion'].includes(h.type)).forEach(h => {
      children.push(new Paragraph({ children: [new TextRun(`${formatDate(h.date)} · ${h.type} · ${h.debtTitle} · R${h.amount}`)] }));
    });
    children.push(new Paragraph({ text: 'Transport', heading: HeadingLevel.HEADING_1 }));
    s.history.filter(h => h.type === 'transport').forEach(h => {
      children.push(new Paragraph({ children: [new TextRun(`${formatDate(h.date)} · ${h.debtTitle} · R${h.amount}`)] }));
    });
    children.push(new Paragraph({ text: 'Uber Rides', heading: HeadingLevel.HEADING_1 }));
    s.uberRides.forEach(r => {
      children.push(new Paragraph({ children: [new TextRun(`${formatDate(r.date)} · R${r.price}${r.from ? ' from ' + r.from : ''}${r.to ? ' to ' + r.to : ''}`)] }));
    });
    children.push(new Paragraph({ text: 'Budget Plans', heading: HeadingLevel.HEADING_1 }));
    s.budgetPlans.forEach(p => {
      children.push(new Paragraph({ text: p.name, heading: HeadingLevel.HEADING_2 }));
      p.items.forEach(i => children.push(new Paragraph({ children: [new TextRun(`${i.name}: R${i.price}`)] })));
    });
    triggerDownload(await Packer.toBlob(new Document({ sections: [{ children }] })), 'duey-history.docx');
  };

  const exportAsPdf = async () => {
    const s = getAppState();
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    let y = 15;
    const line = (text: string, indent = 0) => {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.text(text, 10 + indent, y);
      y += 6;
    };
    doc.setFontSize(14); line('DUEY — History Export');
    doc.setFontSize(10); line(`Generated: ${new Date().toLocaleDateString('en-ZA')}`);
    y += 4;
    doc.setFontSize(12); line('DEBTS'); doc.setFontSize(9);
    s.history.filter(h => ['creation','payment','completion'].includes(h.type)).forEach(h => {
      line(`${formatDate(h.date)}  ${h.type.toUpperCase().padEnd(12)} ${h.debtTitle}  R${h.amount}`, 2);
    });
    y += 4; doc.setFontSize(12); line('TRANSPORT'); doc.setFontSize(9);
    s.history.filter(h => h.type === 'transport').forEach(h => { line(`${formatDate(h.date)}  ${h.debtTitle}  R${h.amount}`, 2); });
    y += 4; doc.setFontSize(12); line('UBER RIDES'); doc.setFontSize(9);
    s.uberRides.forEach(r => { line(`${formatDate(r.date)}  R${r.price}${r.from ? '  from: ' + r.from : ''}${r.to ? '  to: ' + r.to : ''}`, 2); });
    y += 4; doc.setFontSize(12); line('BUDGET PLANS'); doc.setFontSize(9);
    s.budgetPlans.forEach(p => {
      line(`${p.name} — Budget R${p.budget}`, 2);
      p.items.forEach(i => line(`- ${i.name}: R${i.price}`, 6));
    });
    doc.save('duey-history.pdf');
  };

  // ──────────────────────────────────────────────────────────────
  // Financial Statement export (new)
  // ──────────────────────────────────────────────────────────────

  const exportStatsPdf = async () => {
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
    const doc = new jsPDF();
    let y = 15;
    const addPage = () => { doc.addPage(); y = 15; };
    const line = (text: string, indent = 0, size = 9) => {
      doc.setFontSize(size);
      if (y > 275) addPage();
      doc.text(text, 10 + indent, y);
      y += size >= 12 ? 9 : 6;
    };
    const divider = () => { y += 3; };

    doc.setFontSize(16); line('DUEY — Financial Statement', 0, 16);
    doc.setFontSize(10); line(`Period: ${periodLabel}`, 0, 10);
    line(`Generated: ${new Date().toLocaleDateString('en-ZA')}`, 0, 9);
    divider();

    doc.setFontSize(13); line('DEBT PAYMENTS', 0, 13); doc.setFontSize(9);
    if (payments.length) {
      payments.forEach(h => line(`${formatDate(h.date)}  ${h.debtTitle}  R${h.amount.toFixed(2)}`, 4));
    } else { line('No payments in this period.', 4); }
    line(`Subtotal: R${totalPaid.toFixed(2)}`, 4);
    divider();

    doc.setFontSize(13); line('TRANSPORT', 0, 13); doc.setFontSize(9);
    if (transport.length) {
      transport.forEach(h => line(`${formatDate(h.date)}  ${h.debtTitle}  R${h.amount.toFixed(2)}`, 4));
    } else { line('No transport entries in this period.', 4); }
    line(`Subtotal: R${totalTrans.toFixed(2)}`, 4);
    divider();

    doc.setFontSize(13); line('UBER RIDES', 0, 13); doc.setFontSize(9);
    if (fRides.length) {
      fRides.forEach(r => {
        const route = r.from && r.to ? `  ${r.from} → ${r.to}` : '';
        line(`${formatDate(r.date)}  R${r.price.toFixed(2)}${route}`, 4);
      });
    } else { line('No Uber rides in this period.', 4); }
    line(`Subtotal: R${totalUber.toFixed(2)}`, 4);
    divider();

    doc.setFontSize(13); line('SUMMARY', 0, 13); doc.setFontSize(9);
    line(`Debt Payments : R${totalPaid.toFixed(2)}`, 4);
    line(`Transport     : R${totalTrans.toFixed(2)}`, 4);
    line(`Uber Rides    : R${totalUber.toFixed(2)}`, 4);
    line(`─────────────────────────────`, 4);
    doc.setFontSize(10);
    line(`Grand Total   : R${(totalPaid + totalTrans + totalUber).toFixed(2)}`, 4, 10);

    doc.save(`duey-statement-${statsPeriod}.pdf`);
  };

  const exportStatsExcel = async () => {
    const s = getAppState();
    const cutoff = statsPeriod === '3m' ? subMonths(new Date(), 3)
                 : statsPeriod === '6m' ? subMonths(new Date(), 6)
                 : new Date(0);
    const fHist  = s.history.filter(h => isAfter(new Date(h.date), cutoff));
    const fRides = s.uberRides.filter(r => isAfter(new Date(r.date), cutoff));

    const { utils, writeFile } = await import('xlsx');
    const wb = utils.book_new();

    utils.book_append_sheet(wb, utils.json_to_sheet(
      fHist.filter(h => h.type === 'payment').map(h => ({ Date: formatDate(h.date), Debt: h.debtTitle, Amount: h.amount }))
    ), 'Debt Payments');
    utils.book_append_sheet(wb, utils.json_to_sheet(
      fHist.filter(h => h.type === 'transport').map(h => ({ Date: formatDate(h.date), Description: h.debtTitle, Amount: h.amount }))
    ), 'Transport');
    utils.book_append_sheet(wb, utils.json_to_sheet(
      fRides.map(r => ({ Date: formatDate(r.date), From: r.from ?? '', To: r.to ?? '', Price: r.price, 'Distance (km)': r.distance ?? '' }))
    ), 'Uber Rides');

    const totalPaid  = fHist.filter(h => h.type === 'payment').reduce((a, h) => a + h.amount, 0);
    const totalTrans = fHist.filter(h => h.type === 'transport').reduce((a, h) => a + h.amount, 0);
    const totalUber  = fRides.reduce((a, r) => a + r.price, 0);
    utils.book_append_sheet(wb, utils.json_to_sheet([
      { Category: 'Debt Payments', Total: totalPaid },
      { Category: 'Transport',     Total: totalTrans },
      { Category: 'Uber Rides',    Total: totalUber },
      { Category: 'Grand Total',   Total: totalPaid + totalTrans + totalUber },
    ]), 'Summary');

    writeFile(wb, `duey-statement-${statsPeriod}.xlsx`);
  };

  // ──────────────────────────────────────────────────────────────
  // User Config export / import (new)
  // ──────────────────────────────────────────────────────────────

  const exportUserConfig = async () => {
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
    triggerDownload(configBlob, 'duey-config.json');
  };

  const handleConfigImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.type !== 'duey-config') {
          setError('Not a valid Duey config file.');
          return;
        }
        const partial: AppData = {};
        if (data.themeSettings)       partial.themeSettings       = data.themeSettings;
        if (data.userProfile)         partial.userProfile         = data.userProfile;
        if (data.notificationSettings) partial.notificationSettings = data.notificationSettings;
        if (data.userThemes)          partial.userThemes          = data.userThemes;
        importData(partial);
        if (data.backgroundImage) await idbSet('backgroundImage', data.backgroundImage);
        if (data.avatarImage) await idbSet('profileAvatar', data.avatarImage);
        setTimeout(() => window.location.reload(), 600);
      } catch {
        setError('Failed to read config file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // ──────────────────────────────────────────────────────────────
  // Full backup (existing)
  // ──────────────────────────────────────────────────────────────

  const handleExport = () => {
    const dataStr = JSON.stringify(getAppState(), null, 2);
    triggerDownload(new Blob([dataStr], { type: 'application/json' }), 'duey-backup.json');
  };

  const handleImportClick = () => fullFileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          importData(JSON.parse(e.target?.result as string));
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

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
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
            <input ref={configFileInputRef} type="file" accept=".json" onChange={handleConfigImport} className="hidden" />
          </div>
        </CardContent>
      </Card>

      {/* Financial Statement */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Financial Statement</p>
          <p className="text-[10px] text-muted-foreground/70">Detailed report of payments, transport and Uber — like a bank statement</p>
          {/* Period picker */}
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
          {/* Export format buttons */}
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
          <input ref={fullFileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
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
