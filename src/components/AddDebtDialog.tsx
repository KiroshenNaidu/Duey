'use client';

import { useState, useContext, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AppDataContext } from '@/context/AppDataContext';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';

const debtSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  total_owed: z.coerce.number().positive('Total amount must be positive'),
  installment_amount: z.coerce.number().positive('Installment amount must be positive'),
});

type DebtFormValues = z.infer<typeof debtSchema>;

export function AddDebtDialog({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { addDebt } = useContext(AppDataContext);
  
  const form = useForm<DebtFormValues>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      title: '',
      total_owed: undefined,
      installment_amount: undefined,
    }
  });

  const onSubmit = (data: DebtFormValues) => {
    addDebt(data);
    form.reset();
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Debt</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Debt Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Car Loan" {...field} />
                  </FormControl>
                  <FormMessage />
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
                    <Input type="number" placeholder="e.g., 150000" {...field} />
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
                    <Input type="number" placeholder="e.g., 2500" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
               <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Add Debt</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
