'use client';
import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Textarea } from './ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AppData, ThemeSettings } from '@/lib/types';

export function DeveloperMode() {
  const [isClient, setIsClient] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [jsonString, setJsonString] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
  }, []);

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
      
      // Validate and set each key
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

  if (!isClient) return null;

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full">Developer Options</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enter Developer Mode?</AlertDialogTitle>
            <AlertDialogDescription>
              Warning: Entering Developer Mode. Manual changes to raw data can break the app. Proceed with caution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={openEditor}>Enter</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </>
  );
}
