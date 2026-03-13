'use client';

import { useContext, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppDataContext } from '@/context/AppDataContext';
import type { AppData } from '@/lib/types';
import { Download, Upload, Trash2, Code } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

export function DataManagementMenu() {
  const { debts, history, importData, clearData } = useContext(AppDataContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [jsonString, setJsonString] = useState('');
  const { toast } = useToast();

  const handleExport = () => {
    const appData: AppData = { debts, history };
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
          toast({ title: 'Import Failed', description: 'Invalid backup file format.', variant: 'destructive'});
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }
  };

  const openEditor = () => {
    const debts = localStorage.getItem('debts') || '[]';
    const history = localStorage.getItem('history') || '[]';
    const transportSettings = localStorage.getItem('transportSettings') || '{}';
    const transportOverrides = localStorage.getItem('transportOverrides') || '{}';
    const themeSettings = localStorage.getItem('themeSettings') || '{}';
    
    const appState = {
      debts: JSON.parse(debts),
      history: JSON.parse(history),
      transportSettings: JSON.parse(transportSettings),
      transportOverrides: JSON.parse(transportOverrides),
      themeSettings: JSON.parse(themeSettings),
    };

    setJsonString(JSON.stringify(appState, null, 2));
    setIsEditorOpen(true);
  };
  
  const handleSaveChanges = () => {
    try {
      const newState = JSON.parse(jsonString);
      
      if (newState.debts) localStorage.setItem('debts', JSON.stringify(newState.debts));
      if (newState.history) localStorage.setItem('history', JSON.stringify(newState.history));
      if (newState.transportSettings) localStorage.setItem('transportSettings', JSON.stringify(newState.transportSettings));
      if (newState.transportOverrides) localStorage.setItem('transportOverrides', JSON.stringify(newState.transportOverrides));
      if (newState.themeSettings) localStorage.setItem('themeSettings', JSON.stringify(newState.themeSettings));

      toast({
        title: 'Success!',
        description: 'Raw data has been updated. The app will now reload.',
      });
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
      setIsEditorOpen(false);

    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Syntax Error',
        description: `Invalid JSON: ${e.message}`,
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <Button onClick={handleExport} className="w-full justify-start h-auto p-4 text-left">
              <Download className="mr-4 h-5 w-5 flex-shrink-0" />
              <div>
                <p className='font-semibold text-base'>Export Data</p>
                <p className='font-normal text-sm text-primary-foreground/80'>Save a local backup of your data.</p>
              </div>
          </Button>
          <Button onClick={handleImportClick} variant="secondary" className="w-full justify-start h-auto p-4 text-left">
              <Upload className="mr-4 h-5 w-5 flex-shrink-0" />
               <div>
                <p className='font-semibold text-base'>Import Data</p>
                <p className='font-normal text-sm text-secondary-foreground/80'>Restore from a backup file.</p>
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
        <CardContent className="p-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="w-full justify-start h-auto p-4 text-left">
                <Code className="mr-4 h-5 w-5 flex-shrink-0" />
                <div>
                    <p className='font-semibold text-base'>Developer Mode</p>
                    <p className='font-normal text-sm text-muted-foreground'>Edit raw application state.</p>
                </div>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Enter Developer Mode?</AlertDialogTitle>
                <AlertDialogDescription>
                  Warning: Manual changes to raw data can break the app. This is for advanced users only. Proceed with caution.
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

      <div className="pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full">
              <Trash2 className="mr-2 h-4 w-4" /> 
              Reset All Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete all app data including debts, history, and settings.
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
          <DialogHeader><DialogTitle>Raw Application State (JSON)</DialogTitle></DialogHeader>
          <Textarea 
            value={jsonString}
            onChange={(e) => setJsonString(e.target.value)}
            className="h-[60vh] font-mono text-xs"
            placeholder="Raw JSON data..."
          />
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
