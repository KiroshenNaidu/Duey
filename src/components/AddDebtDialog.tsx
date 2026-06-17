'use client';

import { useState, useContext, useMemo, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AppDataContext } from '@/context/AppDataContext';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { formatCurrency } from '@/lib/utils';

const debtSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  total_owed: z.coerce.number().positive('Total amount must be positive'),
  installment_amount: z.coerce.number().positive('Installment amount must be positive'),
});

type DebtFormValues = z.infer<typeof debtSchema>;

export function AddDebtDialog({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { addDebt, history } = useContext(AppDataContext);

  const form = useForm<DebtFormValues>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      title: '',
      total_owed: '' as unknown as number,
      installment_amount: '' as unknown as number,
    },
  });

  const personSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return history
      .filter(h => h.type === 'creation')
      .map(h => h.debtTitle)
      .filter(name => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });
  }, [history]);

  const filteredSuggestions = useMemo(() =>
    titleInput.length > 0
      ? personSuggestions.filter(s => s.toLowerCase().includes(titleInput.toLowerCase()))
      : [],
    [titleInput, personSuggestions]
  );

  function getPersonStats(name: string) {
    const creations = history.filter(h => h.type === 'creation' && h.debtTitle === name);
    const completions = history.filter(h => h.type === 'completion' && h.debtTitle === name);
    const payments = history.filter(h => h.type === 'payment' && h.debtTitle === name);
    const totalPaid = payments.reduce((s, h) => s + h.amount, 0);
    return { timesInDebt: creations.length, totalPaid, completions: completions.length };
  }

  const handleSelectSuggestion = (name: string) => {
    form.setValue('title', name);
    setTitleInput(name);
    setShowSuggestions(false);
  };

  const onSubmit = (data: DebtFormValues) => {
    addDebt(data);
    form.reset();
    setTitleInput('');
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) { form.reset(); setTitleInput(''); setShowSuggestions(false); }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Debt</DialogTitle>
          <DialogDescription className="sr-only">Enter the debt title, total amount owed, and monthly installment to start tracking.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Debt Title / Person</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., John, Car Loan"
                      {...field}
                      value={titleInput}
                      onChange={(e) => {
                        setTitleInput(e.target.value);
                        field.onChange(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="border border-border rounded-md bg-card shadow-lg overflow-hidden -mt-1">
                      {filteredSuggestions.map(name => {
                        const stats = getPersonStats(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                            onMouseDown={() => handleSelectSuggestion(name)}
                          >
                            <div className="text-sm font-medium text-foreground">{name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {stats.timesInDebt}× in debt · {formatCurrency(stats.totalPaid)} paid
                              {stats.completions > 0 ? ` · ${stats.completions} completed` : ''}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="total_owed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Amount Owed (R)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 5000" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="installment_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Installment Amount (R)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 500" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </DialogClose>
              <Button type="submit">Add Debt</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
