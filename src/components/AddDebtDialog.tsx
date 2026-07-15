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
import { personKey, derivePersonProfiles, type PersonProfile } from '@/lib/persons';

const debtSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  total_owed: z.coerce.number().positive('Total amount must be positive'),
  installment_amount: z.coerce.number().positive('Installment amount must be positive'),
  // PURELY optional — empty means no due date and no reminder for this debt.
  dueDay: z.union([z.coerce.number().int().min(1, 'Day must be 1–31').max(31, 'Day must be 1–31'), z.literal('')]).optional(),
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
      dueDay: '',
    },
  });

  // Everything the dropdown shows is aggregated from history — there is no separate person
  // store. Shared with the People manager (History page) via derivePersonProfiles.
  const personProfiles = useMemo(() => derivePersonProfiles(history), [history]);

  const filteredSuggestions = useMemo(() => {
    const q = personKey(titleInput);
    const ranked = [...personProfiles]
      .filter(p => q === '' || p.key.includes(q))
      .sort((a, b) => {
        if (q) {
          // Prefix matches ("jo" → "John") rank above mid-string matches ("jo" → "Major").
          const ap = a.key.startsWith(q) ? 0 : 1;
          const bp = b.key.startsWith(q) ? 0 : 1;
          if (ap !== bp) return ap - bp;
        }
        return b.lastActivity - a.lastActivity; // otherwise most recent first
      });
    // Nothing to offer when the field already exactly matches the sole suggestion.
    if (ranked.length === 1 && ranked[0].key === q) return [];
    return ranked.slice(0, 6);
  }, [titleInput, personProfiles]);

  const handleSelectSuggestion = (profile: PersonProfile) => {
    form.setValue('title', profile.name);
    setTitleInput(profile.name);
    setShowSuggestions(false);
  };

  const onSubmit = (data: DebtFormValues) => {
    const { dueDay, title, ...rest } = data;
    // Trim on creation so the stored title (and the person key derived from it) stays clean.
    addDebt({ ...rest, title: title.trim(), dueDay: typeof dueDay === 'number' ? dueDay : null });
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
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="border border-border rounded-md bg-card shadow-lg overflow-hidden -mt-1">
                      {filteredSuggestions.map(profile => (
                        <button
                          key={profile.key}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                          onMouseDown={() => handleSelectSuggestion(profile)}
                        >
                          <div className="text-sm font-medium text-foreground">{profile.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {profile.timesInDebt}× in debt · {formatCurrency(profile.totalPaid)} paid
                            {profile.completions > 0 ? ` · ${profile.completions} completed` : ''}
                          </div>
                        </button>
                      ))}
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
            <FormField
              control={form.control}
              name="dueDay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Day <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={31} placeholder="e.g., 15 — leave empty for none" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <p className="text-[10px] text-muted-foreground">Day of the month this payment is due. Sets an Android reminder — leave empty to skip.</p>
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
