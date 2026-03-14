'use client';

import { useContext, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppDataContext } from '@/context/AppDataContext';
import type { AppData } from '@/lib/types';
import { Download, Upload, Trash2, Code, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

export function DataManagementMenu() {
  const { getAppState, importData, clearData } = useContext(AppDataContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [jsonString, setJsonString] = useState('');
  const [error, setError] = useState('');

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

    } catch (e: any) {
      setError(`Validation Error: ${e.message}`);
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
