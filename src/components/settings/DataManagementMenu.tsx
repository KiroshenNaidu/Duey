'use client';

import { useContext, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppDataContext } from '@/context/AppDataContext';
import type { AppData } from '@/lib/types';
import { Download, Upload, Trash2, Code, Sparkles, FileText, FileSpreadsheet, Sheet, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

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

export function DataManagementMenu() {
  const { getAppState, importData, clearData } = useContext(AppDataContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [jsonString, setJsonString] = useState('');
  const [error, setError] = useState('');

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
        if (e.type === 'creation') lines.push(`  Created R${e.amount} on ${formatDate(e.date)}`);
        else if (e.type === 'payment') lines.push(`  Paid R${e.amount} on ${formatDate(e.date)}`);
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

    const historyData = s.history.map(h => ({ Date: formatDate(h.date), Type: h.type, Name: h.debtTitle, Amount: h.amount }));
    utils.book_append_sheet(wb, utils.json_to_sheet(historyData), 'History');

    const uberData = s.uberRides.map(r => ({ Date: formatDate(r.date), From: r.from ?? '', To: r.to ?? '', Price: r.price, Distance_km: r.distance ?? '' }));
    utils.book_append_sheet(wb, utils.json_to_sheet(uberData), 'Uber Rides');

    const budgetData = s.budgetPlans.flatMap(p => p.items.map(i => ({ Plan: p.name, Budget: p.budget, Item: i.name, Price: i.price, Link: i.link ?? '' })));
    utils.book_append_sheet(wb, utils.json_to_sheet(budgetData), 'Budget Plans');

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
    const doc = new Document({ sections: [{ children }] });
    const buf = await Packer.toBlob(doc);
    triggerDownload(buf, 'duey-history.docx');
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
    doc.setFontSize(12); line('DEBTS');
    doc.setFontSize(9);
    s.history.filter(h => ['creation','payment','completion'].includes(h.type)).forEach(h => {
      line(`${formatDate(h.date)}  ${h.type.toUpperCase().padEnd(12)} ${h.debtTitle}  R${h.amount}`, 2);
    });
    y += 4; doc.setFontSize(12); line('TRANSPORT');
    doc.setFontSize(9);
    s.history.filter(h => h.type === 'transport').forEach(h => {
      line(`${formatDate(h.date)}  ${h.debtTitle}  R${h.amount}`, 2);
    });
    y += 4; doc.setFontSize(12); line('UBER RIDES');
    doc.setFontSize(9);
    s.uberRides.forEach(r => {
      line(`${formatDate(r.date)}  R${r.price}${r.from ? '  from: ' + r.from : ''}${r.to ? '  to: ' + r.to : ''}`, 2);
    });
    y += 4; doc.setFontSize(12); line('BUDGET PLANS');
    doc.setFontSize(9);
    s.budgetPlans.forEach(p => {
      line(`${p.name} — Budget R${p.budget}`, 2);
      p.items.forEach(i => line(`- ${i.name}: R${i.price}`, 6));
    });
    doc.save('duey-history.pdf');
  };

  const handleExport = () => {
    const appData = getAppState();
    const dataStr = JSON.stringify(appData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'debt_backup.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const data = JSON.parse(text);
          importData(data);
        } catch (error) {
          console.error('Failed to parse backup file:', error);
          setError('Invalid backup file format.');
        }
      };
      reader.onerror = () => {
        setError('Failed to read file.');
      };
      reader.readAsText(file);
      event.target.value = '';
    }
  };

  const openEditor = () => {
    const appState = getAppState();
    setJsonString(JSON.stringify(appState, null, 2));
    setIsEditorOpen(true);
    setError('');
  };
  
  const handleSaveChanges = () => {
    try {
      setError('');
      const newState: AppData = JSON.parse(jsonString);

      if (!newState.debts || !Array.isArray(newState.debts)) throw new Error("'debts' array is missing or invalid.");
      if (!newState.history || !Array.isArray(newState.history)) throw new Error("'history' array is missing or invalid.");
      if (!newState.themeSettings || typeof newState.themeSettings !== 'object') throw new Error("'themeSettings' object is missing or invalid.");
      
      importData(newState);
      
      setTimeout(() => { window.location.reload(); }, 1000);
      setIsEditorOpen(false);

    } catch (e: unknown) {
      setError(`Validation Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handlePrettify = () => {
    try {
        setError('');
        const parsed = JSON.parse(jsonString);
        setJsonString(JSON.stringify(parsed, null, 2));
    } catch {
        setError('Cannot prettify invalid JSON.');
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Export History</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={exportAsTxt} variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <FileText className="h-3.5 w-3.5" /> Text (.txt)
            </Button>
            <Button onClick={exportAsCsv} variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV (.csv)
            </Button>
            <Button onClick={exportAsExcel} variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <Sheet className="h-3.5 w-3.5" /> Excel (.xlsx)
            </Button>
            <Button onClick={exportAsWord} variant="secondary" size="sm" className="justify-start gap-2 text-xs">
              <BookOpen className="h-3.5 w-3.5" /> Word (.docx)
            </Button>
            <Button onClick={exportAsPdf} variant="secondary" size="sm" className="justify-start gap-2 text-xs col-span-2">
              <FileText className="h-3.5 w-3.5" /> PDF (.pdf)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2 space-y-2">
          <Button onClick={handleExport} className="w-full justify-start h-auto p-3 text-left">
              <Download className="mr-3 h-4 w-4 flex-shrink-0" />
              <div>
                <p className='font-semibold text-sm'>Export Data</p>
                <p className='font-normal text-[10px] text-primary-foreground/80'>Save a local backup of your data</p>
              </div>
          </Button>
          <Button onClick={handleImportClick} variant="secondary" className="w-full justify-start h-auto p-3 text-left">
              <Upload className="mr-3 h-4 w-4 flex-shrink-0" />
               <div>
                <p className='font-semibold text-sm'>Import Data</p>
                <p className='font-normal text-[10px] text-secondary-foreground/80'>Restore from a backup file</p>
              </div>
          </Button>
          <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
          />
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="w-full justify-start h-auto p-3 text-left">
                <Code className="mr-3 h-4 w-4 flex-shrink-0" />
                <div>
                    <p className='font-semibold text-sm'>Developer Mode</p>
                    <p className='font-normal text-[10px] text-muted-foreground'>Edit raw application state</p>
                </div>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Enter Developer Mode?</AlertDialogTitle>
                <AlertDialogDescription>
                  Warning: Manual changes to raw data can break the app. This is for advanced users only.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={openEditor}>Enter</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <div className="pt-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full h-9 text-xs">
              <Trash2 className="mr-2 h-4 w-4" /> 
              Reset All Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete all app data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clearData} className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>Delete Everything</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className='flex justify-between items-center'>
              <DialogTitle>Raw Application State (JSON)</DialogTitle>
              <Button variant="outline" size="sm" onClick={handlePrettify}><Sparkles className='mr-2 h-4 w-4'/>Prettify</Button>
            </div>
          </DialogHeader>
          <Textarea 
            value={jsonString}
            onChange={(e) => setJsonString(e.target.value)}
            className="h-[60vh] font-mono text-xs"
            placeholder="Raw JSON data..."
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveChanges}>Validate & Push Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
