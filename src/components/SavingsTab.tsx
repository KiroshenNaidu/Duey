'use client';

import { useContext, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import {
  calculateLiveMonthly, cycleLabelFromKey, getPayCycle, listRecentCycles,
} from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeading, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SavingsTrendCard } from '@/components/stats/CycleCharts';
import { LegendDot, StatPill } from '@/components/stats/StatPrimitives';
import { SwipeableRow } from '@/components/SwipeableRow';
import { FixedPortal } from '@/components/FixedPortal';
import { useFabLongPress, usePageFab, FAB_TOUCH_STYLE, FabPulse } from '@/components/QuickAdd';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';
import { showUndoToast } from '@/components/ui/undo-toast';
import { hapticTap, hapticTick } from '@/lib/haptics';
import type { SavingEntry } from '@/lib/types';
import {
  PiggyBank, Plus, Trash2, Sparkles, HandCoins, ChevronDown, TrendingUp, Trophy,
} from 'lucide-react';

/**
 * Stats → Savings. A ledger of money kept, filed by pay cycle.
 *
 * The point of it is the automatic half: when a cycle ends, whatever the balance still had
 * left is swept in as a "Leftover" entry (see the seal in AppDataContext). Saving is then
 * the DEFAULT outcome of not spending, rather than something you have to remember to
 * record. Anything else — a transfer to a savings account, cash put aside — goes in by
 * hand against whichever cycle it belongs to.
 *
 * The two kinds land on Balance differently, and the asymmetry is the point:
 *   • MANUAL entries are a deduction — money you moved out is money you cannot spend, so
 *     it comes off Remaining for the cycle they are filed against.
 *   • AUTO leftovers never are. A leftover IS Remaining, already net of everything above
 *     it; deducting it as well would subtract the same money twice.
 * So a cycle's savings total reads "what I put away" + "what I had left", never one twice.
 *
 * The tab reads as three questions in order: how much is there (the hero, split by how it
 * got there), what is this cycle adding (the forecast, against how far through the cycle
 * it is), and where did each piece come from (the ledger, a cycle at a time).
 */

// The two kinds of savings, in the same colours the trend chart stacks them in — so a bar
// here and a column there are obviously the same two kinds of money.
const AUTO_COLOR = 'hsl(var(--positive))';       // left over, swept at cycle end
const MANUAL_COLOR = 'hsl(var(--cat-snapshot))'; // put away on purpose

export function SavingsTab() {
  const { savings, userProfile, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides,
          transportSettings, transportOverrides, transportMonthlyOverrides,
          addSaving, deleteSaving, restoreSaving } = useContext(AppDataContext);

  const payDay = userProfile.paydayDay;
  const cycle = useMemo(() => getPayCycle(payDay), [payDay]);
  const cycleOptions = useMemo(() => listRecentCycles(payDay, 11), [payDay]);

  // The + FAB owns adding, exactly as it does on the money page: this tab's only add
  // action is a manual entry, so it earns the page's FAB rather than a card of its own.
  const pathname = usePathname();
  const fabLongPress = useFabLongPress();
  usePageFab(pathname === '/stats');   // stand the lightning FAB down while this one shows

  const [addOpen, setAddOpen] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  const [label, setLabel] = useState('');
  const [cycleKey, setCycleKey] = useState(cycle.key);
  const [error, setError] = useState('');
  // Which ledger groups the user has explicitly opened or shut. Anything untouched follows
  // the default: newest cycle open, older ones folded away.
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});

  const entries = useMemo(() => savings ?? [], [savings]);
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const autoTotal = entries.filter(e => e.source === 'auto').reduce((s, e) => s + e.amount, 0);
  const manualTotal = total - autoTotal;

  // What this cycle is currently on course to bank, straight from the Balance calculator —
  // the same number the Remaining card shows, because it is the same number.
  const live = useMemo(
    () => calculateLiveMonthly({
      payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
      transportSettings, transportOverrides, transportMonthlyOverrides,
    }),
    [payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
     transportSettings, transportOverrides, transportMonthlyOverrides],
  );

  // Newest cycle first; entries inside a cycle newest first. Grouping by cycle is the whole
  // filing system — "what did I keep out of that pay?" is the question this tab answers.
  const groups = useMemo(() => {
    const byCycle = new Map<string, SavingEntry[]>();
    for (const e of entries) {
      const list = byCycle.get(e.cycleKey);
      if (list) list.push(e); else byCycle.set(e.cycleKey, [e]);
    }
    return [...byCycle.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({
        key,
        label: cycleLabelFromKey(key, payDay),
        isCurrent: key === cycle.key,
        entries: [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        subtotal: list.reduce((s, e) => s + e.amount, 0),
      }));
  }, [entries, payDay, cycle.key]);

  const best = useMemo(
    () => groups.reduce<(typeof groups)[number] | null>((b, g) => (!b || g.subtotal > b.subtotal ? g : b), null),
    [groups],
  );

  const submit = () => {
    const amt = parseFloat(amountStr);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    hapticTap();
    addSaving(amt, cycleKey, label.trim() || 'Savings');
    setAmountStr(''); setLabel(''); setCycleKey(cycle.key); setError(''); setAddOpen(false);
  };

  // Reopening starts clean, and on the cycle you are actually in — a half-typed amount left
  // over from a dialog you dismissed is never what you meant to add next time.
  const onOpenChange = (open: boolean) => {
    setAddOpen(open);
    if (!open) { setAmountStr(''); setLabel(''); setCycleKey(cycle.key); setError(''); }
  };

  // Oldest first for the chart — `groups` is newest first, which is the right order for a
  // ledger and the wrong one for a timeline.
  const trend = useMemo(() => [...groups].reverse().map(g => ({
    key: g.key,
    manual: g.entries.filter(e => e.source === 'manual').reduce((s, e) => s + e.amount, 0),
    auto:   g.entries.filter(e => e.source === 'auto').reduce((s, e) => s + e.amount, 0),
  })), [groups]);
  const ready = useReplayOnActive('/stats');

  const remove = (id: string) => {
    const item = entries.find(e => e.id === id);
    if (!item) return;
    deleteSaving(id);
    showUndoToast(`Removed "${item.label}"`, () => restoreSaving(item));
  };

  return (
    <>
    <div className="space-y-3">
      {/* ── Hero: the pile, and how it got there ─────────────────────────────── */}
      <div className="bg-card rounded-3xl p-5">
        <CardHeading
          icon={PiggyBank}
          title="Total saved"
          iconClassName="text-[hsl(var(--positive))]"
          aside={entries.length === 0
            ? undefined
            : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · ${groups.length} cycle${groups.length === 1 ? '' : 's'}`}
        />
        <p className="text-3xl font-bold text-[hsl(var(--positive))] tabular-nums truncate">
          {formatCurrency(total)}
        </p>
        {entries.length === 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">Nothing banked yet</p>
        )}

        {/* The split is the tab's premise made visible: for most cycles the swept half is
            the story. Widths animate in on every visit, the same 700ms ease every other
            bar in the app fills on. */}
        {total > 0 && (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary mt-4">
              {autoTotal > 0 && (
                <div
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', ready && 'transition-[width] duration-700')}
                  style={{ width: `${ready ? (autoTotal / total) * 100 : 0}%`, background: AUTO_COLOR }}
                />
              )}
              {manualTotal > 0 && (
                <div
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', ready && 'transition-[width] duration-700')}
                  style={{ width: `${ready ? (manualTotal / total) * 100 : 0}%`, background: MANUAL_COLOR }}
                />
              )}
            </div>
            <div className="flex items-center gap-4 mt-2.5">
              <LegendDot color={AUTO_COLOR} label="Left over" value={formatCurrency(autoTotal)} />
              <LegendDot color={MANUAL_COLOR} label="Put away" value={formatCurrency(manualTotal)} />
            </div>
          </>
        )}
      </div>

      {/* ── This cycle's forecast ────────────────────────────────────────────────
          Framed as a forecast, never as banked money: it only becomes an entry when the
          cycle actually ends with it intact — so how far through the cycle you are sits
          right under the figure. */}
      <div className="bg-card rounded-2xl p-4">
        <CardHeading
          icon={Sparkles}
          title="This cycle"
          aside={`${cycle.daysLeft} day${cycle.daysLeft === 1 ? '' : 's'} left`}
        />

        <p className={cn(
          'text-2xl font-bold tabular-nums leading-tight',
          live.remaining > 0 ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {formatCurrency(Math.max(0, live.remaining))}
        </p>

        <div className="h-1 w-full rounded-full bg-secondary overflow-hidden mt-3">
          <div
            className={cn('h-full rounded-full', ready && 'transition-[width] duration-700')}
            style={{ width: `${ready ? cycle.progress * 100 : 0}%`, background: 'hsl(var(--accent))' }}
          />
        </div>

        <p className="text-[10px] text-muted-foreground mt-2">
          {live.remaining > 0
            ? `Left over so far, banked automatically on ${format(cycle.end, 'd MMM')} if it survives the cycle.`
            : live.remaining < 0
              ? `Over budget by ${formatCurrency(Math.abs(live.remaining))} — a cycle that ends short banks nothing.`
              : 'Nothing left over yet this cycle.'}
        </p>
      </div>

      {/* Two figures the ledger cannot show at a glance — only worth the space once there
          is more than one cycle to compare. */}
      {groups.length > 1 && best && (
        <div className="grid grid-cols-2 gap-2">
          <StatPill icon={TrendingUp} label="Avg / cycle" value={formatCurrency(total / groups.length)} />
          <StatPill icon={Trophy} label="Best cycle" value={formatCurrency(best.subtotal)} sub={best.label} />
        </div>
      )}

      <SavingsTrendCard cycles={trend} payDay={payDay} ready={ready} />

      {/* ── The ledger ───────────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-base">Nothing put away yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Whatever is left when a cycle ends lands here on its own.</p>
            <p className="text-xs text-muted-foreground mt-1">Tap the + button to add money you put away yourself.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Ledger</p>
          {groups.map((group, i) => {
            // Newest cycle open, the rest folded: older cycles are history you go looking
            // for, not something to scroll past on every visit.
            const open = openOverrides[group.key] ?? i === 0;
            return (
              <div key={group.key} className="bg-card rounded-2xl overflow-hidden">
                <button
                  onClick={() => { hapticTick(); setOpenOverrides(o => ({ ...o, [group.key]: !open })); }}
                  aria-expanded={open}
                  className="w-full flex items-center gap-2 p-3.5 text-left active:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {group.label}{group.isCurrent && <span className="text-accent"> · current</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-[hsl(var(--positive))] tabular-nums shrink-0">
                    {formatCurrency(group.subtotal)}
                  </p>
                  <ChevronDown className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200',
                    open && 'rotate-180',
                  )} />
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key={`${group.key}-entries`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.28 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2.5 pb-2.5 space-y-1.5">
                        {group.entries.map(e => (
                          <SavingRow key={e.id} entry={e} onDelete={remove} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* The page's + FAB, same control the money page uses to add a debt: same position,
        same pulse, same long-press-for-the-quick-add-radial. Pathname-gated because the
        carousel keeps /stats mounted behind other pages, and this tab is only mounted
        while Savings is the open tab — so the FAB is present exactly when it is useful. */}
    {pathname === '/stats' && (
      <FixedPortal>
        <button
          aria-label="Add savings"
          onClick={() => setAddOpen(true)}
          className="fab-blurable fixed left-1/2 -translate-x-1/2 h-12 w-12 rounded-full focus:outline-none transition-transform hover:scale-105 z-40"
          style={{ bottom: 'calc(10px + var(--sab))', ...FAB_TOUCH_STYLE }}
          {...fabLongPress}
        >
          <FabPulse><Plus className="h-5 w-5" /></FabPulse>
        </button>
      </FixedPortal>
    )}

    <Dialog open={addOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add savings</DialogTitle>
          <DialogDescription>Money you put away yourself — leftovers arrive on their own.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label className="text-xs">Amount</Label>
            <Input
              type="number" inputMode="decimal" placeholder="e.g., 1500"
              value={amountStr} onChange={e => setAmountStr(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="h-9 text-sm" autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Label (optional)</Label>
            <Input
              placeholder="e.g., Emergency fund"
              value={label} onChange={e => setLabel(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cycle</Label>
            {/* Defaults to the cycle you are in — the overwhelmingly common case — with the
                last year of cycles available for money recorded after the fact. */}
            <Select value={cycleKey} onValueChange={setCycleKey}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {cycleOptions.map(c => (
                  <SelectItem key={c.key} value={c.key} className="text-xs">
                    {c.label}{c.key === cycle.key ? ' · current' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={submit} className="w-full h-9 text-xs">Add to savings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

/** One ledger line. Swipe left to delete (the undo toast is the 5s safety net) or use the
 *  button — the tray is absent entirely when swipe actions are off in settings. */
function SavingRow({ entry, onDelete }: { entry: SavingEntry; onDelete: (id: string) => void }) {
  const auto = entry.source === 'auto';
  return (
    <SwipeableRow
      rightActions={[{ icon: Trash2, label: 'Delete', tone: 'destructive', onAction: () => onDelete(entry.id) }]}
    >
      <div className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {/* Title on its own line, then the chip and the date under it — the expense row's
              layout, because it is the same kind of line. */}
          <span className="block text-sm font-semibold text-foreground truncate">{entry.label}</span>
          <div className="flex items-center gap-2 mt-1 min-w-0">
            {/* Where it came from, in the app's category chip rather than a colour tile:
                every other kind-marker in the app (recurring expenses, history types) is
                this pill. */}
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
              auto ? 'bg-positive/15 text-positive' : 'bg-snapshot/15 text-snapshot',
            )}>
              {auto ? <Sparkles className="h-2.5 w-2.5" /> : <HandCoins className="h-2.5 w-2.5" />}
              {auto ? 'Swept' : 'Put away'}
            </span>
            <p className="text-xs text-muted-foreground truncate">
              {format(new Date(entry.createdAt), 'd MMM yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-bold tabular-nums text-[hsl(var(--positive))]">
            +{formatCurrency(entry.amount)}
          </span>
          <button
            onClick={() => onDelete(entry.id)}
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label={`Remove ${entry.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </SwipeableRow>
  );
}
