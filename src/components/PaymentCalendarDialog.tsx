'use client';

import { useState, useContext, useMemo, ReactNode } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import type { Debt } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  format,
  getDaysInMonth,
  startOfMonth,
  getDay,
  add,
  sub,
  isSameDay,
  isBefore,
  parseISO,
  startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface MonthCardProps {
  monthDate: Date;
  paidDates: Date[];
  onDayClick: (date: Date) => void;
}

function MonthCard({ monthDate, paidDates, onDayClick }: MonthCardProps) {
  const monthStart = startOfMonth(monthDate);
  const daysInMonth = Array.from({ length: getDaysInMonth(monthDate) }, (_, i) => add(monthStart, { days: i }));
  const firstDayOfMonth = getDay(monthStart);

  return (
    <div className="p-3 border rounded-lg bg-card">
      <h3 className="text-center font-semibold mb-2">{format(monthDate, 'MMMM')}</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono text-muted-foreground">
        {WEEK_DAYS.map((day, i) => <div key={i}>{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 mt-1">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
        {daysInMonth.map(day => {
          const isPaid = paidDates.some(paidDate => isSameDay(paidDate, day));
          return (
            <button
              key={day.toString()}
              onClick={() => onDayClick(day)}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-xs transition-all hover:bg-secondary",
                isPaid ? "bg-accent text-accent-foreground hover:bg-accent/90" : "bg-transparent",
                isBefore(day, new Date()) && !isSameDay(day, new Date()) ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}


export function PaymentCalendarDialog({ children, debt }: { children: ReactNode, debt: Debt }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const { togglePaymentDate } = useContext(AppDataContext);

  const months = Array.from({ length: 12 }, (_, i) => new Date(viewYear, i, 1));
  const paidDates = useMemo(() => (debt.paymentDates || []).map(d => parseISO(d)), [debt.paymentDates]);

  const handleDayClick = (date: Date) => {
    togglePaymentDate(debt.id, startOfDay(date));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl w-full h-[90dvh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="truncate pr-16">{debt.title}: Payment History</DialogTitle>
           <div className="flex justify-between items-center pt-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setViewYear(y => y - 1)}>
                <ChevronLeft />
              </Button>
              <span className="text-lg font-bold w-24 text-center">{viewYear}</span>
              <Button variant="outline" size="icon" onClick={() => setViewYear(y => y + 1)} disabled={viewYear === new Date().getFullYear()}>
                <ChevronRight />
              </Button>
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              Total Payments: <span className="text-foreground font-bold">{paidDates.length}</span>
            </p>
          </div>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
                {months.map(month => (
                    <MonthCard 
                        key={month.toString()}
                        monthDate={month}
                        paidDates={paidDates}
                        onDayClick={handleDayClick}
                    />
                ))}
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
