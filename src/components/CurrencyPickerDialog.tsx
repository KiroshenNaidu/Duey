'use client';

import { useContext, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const CURRENCIES: { code: string; name: string; symbol: string; region: string }[] = [
  // Africa
  { code: 'ZAR', name: 'South African Rand',   symbol: 'R',    region: 'Africa' },
  { code: 'NGN', name: 'Nigerian Naira',        symbol: '₦',   region: 'Africa' },
  { code: 'KES', name: 'Kenyan Shilling',       symbol: 'KSh', region: 'Africa' },
  { code: 'GHS', name: 'Ghanaian Cedi',         symbol: 'GH₵', region: 'Africa' },
  { code: 'EGP', name: 'Egyptian Pound',        symbol: 'E£',  region: 'Africa' },
  { code: 'UGX', name: 'Ugandan Shilling',      symbol: 'USh', region: 'Africa' },
  { code: 'TZS', name: 'Tanzanian Shilling',    symbol: 'TSh', region: 'Africa' },
  { code: 'ZMW', name: 'Zambian Kwacha',        symbol: 'ZK',  region: 'Africa' },
  // Americas & Europe
  { code: 'USD', name: 'US Dollar',             symbol: '$',   region: 'Americas' },
  { code: 'EUR', name: 'Euro',                  symbol: '€',   region: 'Americas' },
  { code: 'GBP', name: 'British Pound',         symbol: '£',   region: 'Americas' },
  { code: 'CAD', name: 'Canadian Dollar',       symbol: 'C$',  region: 'Americas' },
  { code: 'AUD', name: 'Australian Dollar',     symbol: 'A$',  region: 'Americas' },
  { code: 'BRL', name: 'Brazilian Real',        symbol: 'R$',  region: 'Americas' },
  { code: 'MXN', name: 'Mexican Peso',          symbol: 'MX$', region: 'Americas' },
  { code: 'CHF', name: 'Swiss Franc',           symbol: 'CHF', region: 'Americas' },
  // Asia & Middle East
  { code: 'INR', name: 'Indian Rupee',          symbol: '₹',   region: 'Asia' },
  { code: 'CNY', name: 'Chinese Yuan',          symbol: '¥',   region: 'Asia' },
  { code: 'JPY', name: 'Japanese Yen',          symbol: '¥',   region: 'Asia' },
  { code: 'AED', name: 'UAE Dirham',            symbol: 'د.إ', region: 'Asia' },
  { code: 'SAR', name: 'Saudi Riyal',           symbol: '﷼',  region: 'Asia' },
  { code: 'PKR', name: 'Pakistani Rupee',       symbol: 'Rs',  region: 'Asia' },
  { code: 'BDT', name: 'Bangladeshi Taka',      symbol: '৳',   region: 'Asia' },
  { code: 'THB', name: 'Thai Baht',             symbol: '฿',   region: 'Asia' },
  { code: 'SGD', name: 'Singapore Dollar',      symbol: 'S$',  region: 'Asia' },
];

export function CurrencyPickerDialog() {
  const { currency, setCurrency } = useContext(AppDataContext);
  const [selected, setSelected] = useState('ZAR');
  const open = currency === '';

  const save = () => setCurrency(selected);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[380px] p-0 gap-0 overflow-hidden"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader className="px-5 pt-6 pb-3">
          <DialogTitle className="text-xl font-black">What currency do you use?</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Just a quick preference — not a big deal. You can change this anytime in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="px-3 pb-3 max-h-[55vh] overflow-y-auto space-y-1">
          {(['Africa', 'Americas', 'Asia'] as const).map(region => {
            const group = CURRENCIES.filter(c => c.region === region);
            return (
              <div key={region}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 pt-2 pb-1">{region}</p>
                {group.map(c => (
                  <button
                    key={c.code}
                    onClick={() => setSelected(c.code)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                      selected === c.code
                        ? 'bg-accent/15 border border-accent/40'
                        : 'hover:bg-muted/40 border border-transparent'
                    )}
                  >
                    <span className="text-base font-bold w-8 text-center text-foreground shrink-0">{c.symbol}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.code}</p>
                    </div>
                    {selected === c.code && (
                      <span className="ml-auto text-accent font-bold text-xs shrink-0">✓</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-5 pt-2">
          <Button onClick={save} className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
            Use {CURRENCIES.find(c => c.code === selected)?.symbol} {selected}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
