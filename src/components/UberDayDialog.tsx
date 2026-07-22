'use client';

import { useState, useContext } from 'react';
import { format, parseISO } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import type { UberRide } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SwipeableRow } from '@/components/SwipeableRow';
import { showUndoToast } from '@/components/ui/undo-toast';

interface UberDayDialogProps {
  date: string; // ISO YYYY-MM-DD
  rides: UberRide[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UberDayDialog({ date, rides, open, onOpenChange }: UberDayDialogProps) {
  const { addUberRide, deleteUberRide, restoreUberRide } = useContext(AppDataContext);

  // Both delete paths (trash button + full row swipe) get the same 5s undo window.
  const removeRide = (ride: UberRide) => {
    deleteUberRide(ride.id);
    showUndoToast(`Removed ${formatCurrency(ride.price)} ride`, () => restoreUberRide(ride));
  };

  const [price, setPrice] = useState('');
  const [distance, setDistance] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const handleAdd = () => {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) return;
    addUberRide({
      date,
      price: priceNum,
      distance: distance ? parseFloat(distance) : undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
    });
    setPrice('');
    setDistance('');
    setFrom('');
    setTo('');
  };

  const dayTotal = rides.reduce((sum, r) => sum + r.price, 0);
  const formattedDate = format(parseISO(date), 'EEEE, MMMM d');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-sm">{formattedDate}</DialogTitle>
          <DialogDescription className="sr-only">Rides and transport costs for {formattedDate}.</DialogDescription>
          {rides.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {rides.length} ride{rides.length !== 1 ? 's' : ''} · {formatCurrency(dayTotal)} total
            </p>
          )}
        </DialogHeader>

        {rides.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {rides.map(ride => (
              // Swipe left → delete (same as the trash button; full swipe fires it too)
              <SwipeableRow
                key={ride.id}
                rightActions={[{ icon: Trash2, label: 'Delete', tone: 'destructive', onAction: () => removeRide(ride) }]}
              >
                <div className="flex items-center justify-between gap-2 bg-muted/40 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{formatCurrency(ride.price)}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {ride.distance ? `${ride.distance} km` : ''}
                      {ride.distance && (ride.from || ride.to) ? ' · ' : ''}
                      {ride.from && ride.to ? `${ride.from} → ${ride.to}` : ride.from || ride.to || ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removeRide(ride)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </SwipeableRow>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Add Ride</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="uber-price" className="text-[10px]">Price (R) *</Label>
              <Input
                id="uber-price"
                type="number"
                placeholder="e.g., 85"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="uber-distance" className="text-[10px]">Distance (km)</Label>
              <Input
                id="uber-distance"
                type="number"
                placeholder="e.g., 12"
                value={distance}
                onChange={e => setDistance(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="uber-from" className="text-[10px]">From</Label>
              <Input
                id="uber-from"
                placeholder="Pickup"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="uber-to" className="text-[10px]">To</Label>
              <Input
                id="uber-to"
                placeholder="Dropoff"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <Button
            onClick={handleAdd}
            disabled={!price || parseFloat(price) <= 0}
            className="w-full h-8 text-xs font-bold bg-accent text-btn-on-accent hover:bg-accent/90"
          >
            Add Ride
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
