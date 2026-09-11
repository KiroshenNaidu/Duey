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
import {
  DEFAULT_BANK_ID, bankIdOf, savingsTotal, signedAmount,
} from '@/lib/piggybanks';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardHeading, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SavingsTrendCard } from '@/components/stats/CycleCharts';
import { LegendDot, StatPill } from '@/components/stats/StatPrimitives';
import { PiggybankList } from '@/components/savings/PiggybankList';
import { SwipeableRow } from '@/components/SwipeableRow';
import { FixedPortal } from '@/components/FixedPortal';
import { useFabLongPress, usePageFab, FAB_TOUCH_STYLE, FabPulse } from '@/components/QuickAdd';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';
import { showUndoToast } from '@/components/ui/undo-toast';
import { hapticTap, hapticTick } from '@/lib/haptics';
import type { SavingEntry } from '@/lib/types';
import {
  PiggyBank, Plus, Trash2, Sparkles, ArrowDownLeft, ArrowUpRight, ChevronDown, TrendingUp,
  Trophy, RotateCcw,
} from 'lucide-react';

/**
 * Stats → Savings. Money kept, in the jars it is kept in, filed by pay cycle.
 *
 * The point of it is the automatic half: when a cycle ends, whatever the balance still had
 * left is swept into the Leftovers piggybank (see the seal in AppDataContext). Saving is
 * then the DEFAULT outcome of not spending, rather than something you have to remember to
 * record. Anything else — a transfer, cash put aside, a standing order — goes into a jar of
 * your own naming, and can come back out again.
 *
 * The three kinds land on Balance differently, and the asymmetry is the point:
 *   • MANUAL and RECURRING deposits are a deduction — money you moved out is money you
 *     cannot spend, so it comes off Remaining for the cycle they are filed against.
 *   • WITHDRAWALS are the same figure with the sign flipped: money you took back out is
 *     yours to spend again, so it lifts Remaining.
 *   • AUTO leftovers never move Balance at all. A leftover IS Remaining, already net of
 *     everything above it; deducting it as well would subtract the same money twice.
 *
 * The tab reads as four questions in order: how much is there (the hero), what is this
 * cycle adding (the forecast), what is it kept in (the piggybanks), and where did each
 * piece come from (the ledger, a cycle at a time).
 */

// The two ways money arrives, in the same colours the trend chart and the jars use.
const AUTO_COLOR = 'hsl(var(--positive))';       // left over, swept at cycle end
const MANUAL_COLOR = 'hsl(var(--cat-snapshot))'; // put away on purpose

export function SavingsTab() {
  const { savings, piggybanks, recurringSavings, userProfile, monthlyIncome, extraIncomes,
          expenses, budgetPlans, history, uberRides,
          transportSettings, transportOverrides, transportMonthlyOverrides,
          addSaving, deleteSaving, restoreSaving, addRecurringSaving } = useContext(AppDataContext);

  const payDay = userProfile.paydayDay;
  const cycle = useMemo(() => getPayCycle(payDay), [payDay]);
  const cycleOptions = useMemo(() => listRecentCycles(payDay, 11), [payDay]);
  const banks = useMemo(() => piggybanks ?? [], [piggybanks]);

  // The + FAB owns adding, exactly as it does on the money page: this tab's only add
  // action is a movement, so it earns the page's FAB rather than a card of its own.
  const pathname = usePathname();
  const fabLongPress = useFabLongPress();
  usePageFab(pathname === '/stats');   // stand the lightning FAB down while this one shows

  const [addOpen, setAddOpen] = useState(false);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amountStr, setAmountStr] = useState('');
  const [label, setLabel] = useState('');
  const [bankId, setBankId] = useState(DEFAULT_BANK_ID);
  const [cycleKey, setCycleKey] = useState(cycle.key);
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState('');
  // Which ledger groups the user has explicitly opened or shut. Anything untouched follows
  // the default: newest cycle open, older ones folded away.
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});

  const entries = useMemo(() => savings ?? [], [savings]);
  const total = savingsTotal(entries);
  const autoTotal = entries.filter(e => e.source === 'auto' && e.direction !== 'out').reduce((s, e) => s + e.amount, 0);
  const putAwayTotal = entries.filter(e => e.source !== 'auto' && e.direction !== 'out').reduce((s, e) => s + e.amount, 0);
  const takenOutTotal = entries.filter(e => e.direction === 'out').reduce((s, e) => s + e.amount, 0);
  const inTotal = autoTotal + putAwayTotal;

  // What this cycle is currently on course to bank, straight from the Balance calculator —
  // the same number the Remaining card shows, because it is the same number.
  const live = useMemo(
    () => calculateLiveMonthly({
      payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
      recurringSavings, transportSettings, transportOverrides, transportMonthlyOverrides,
    }),
    [payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
     recurringSavings, transportSettings, transportOverrides, transportMonthlyOverrides],
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
        // Net: a cycle you put R500 into and took R200 out of kept R300.
        subtotal: list.reduce((s, e) => s + signedAmount(e), 0),
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
    if (repeat && direction === 'in') {
      // A standing order is a rule, not a movement — it charges every cycle from now on and
      // the seal writes the rows. Withdrawals are never recurring: taking money out on a
      // schedule is a spending plan, not a savings one.
      addRecurringSaving(bankId, amt, label.trim() || 'Standing order');
    } else {
      addSaving(amt, cycleKey, label.trim() || (direction === 'out' ? 'Withdrawal' : 'Savings'), undefined, bankId, direction);
    }
    reset();
    setAddOpen(false);
  };

  const reset = () => {
    setAmountStr(''); setLabel(''); setCycleKey(cycle.key); setError('');
    setDirection('in'); setRepeat(false); setBankId(banks[0]?.id ?? DEFAULT_BANK_ID);
  };

  // Reopening starts clean, and on the cycle you are actually in — a half-typed amount left
  // over from a dialog you dismissed is never what you meant to add next time.
  const onOpenChange = (open: boolean) => {
    setAddOpen(open);
    if (!open) reset();
  };

  const openAddFor = (id: string) => {
    reset();
    setBankId(id);
    setAddOpen(true);
  };

  // Oldest first for the chart — `groups` is newest first, which is the right order for a
  // ledger and the wrong one for a timeline.
  const trend = useMemo(() => [...groups].reverse().map(g => ({
    key: g.key,
    manual: g.entries.filter(e => e.source !== 'auto').reduce((s, e) => s + signedAmount(e), 0),
    auto:   g.entries.filter(e => e.source === 'auto').reduce((s, e) => s + signedAmount(e), 0),
  })), [groups]);
  const ready = useReplayOnActive('/stats');

  const remove = (id: string) => {
    const item = entries.find(e => e.id === id);
    if (!item) return;
    deleteSaving(id);
    showUndoToast(`Removed "${item.label}"`, () => restoreSaving(item));
  };

  const bankName = (id: string) => banks.find(b => b.id === id)?.name ?? 'Savings';

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
            : `${banks.length} ${banks.length === 1 ? 'piggybank' : 'piggybanks'} · ${groups.length} cycle${groups.length === 1 ? '' : 's'}`}
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
        {inTotal > 0 && (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary mt-4">
              {autoTotal > 0 && (
                <div
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', ready && 'transition-[width] duration-700')}
                  style={{ width: `${ready ? (autoTotal / inTotal) * 100 : 0}%`, background: AUTO_COLOR }}
                />
              )}
              {putAwayTotal > 0 && (
                <div
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', ready && 'transition-[width] duration-700')}
                  style={{ width: `${ready ? (putAwayTotal / inTotal) * 100 : 0}%`, background: MANUAL_COLOR }}
                />
              )}
            </div>
            <div className="flex items-center gap-4 mt-2.5">
              <LegendDot color={AUTO_COLOR} label="Left over" value={formatCurrency(autoTotal)} />
              <LegendDot color={MANUAL_COLOR} label="Put away" value={formatCurrency(putAwayTotal)} />
            </div>
            {/* Only worth a line once money has actually come back out — the bar above shows
                what went in, and the total already has the withdrawals taken off it. */}
            {takenOutTotal > 0 && (
              <p className="text-[10px] text-muted-foreground/70 mt-2">
                {formatCurrency(takenOutTotal)} taken back out
              </p>
            )}
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

      {/* ── The jars ─────────────────────────────────────────────────────────── */}
      <PiggybankList onAddTo={openAddFor} />

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
                      {group.entries.length} {group.entries.length === 1 ? 'movement' : 'movements'}
                    </p>
                  </div>
                  <p className={cn(
                    'text-sm font-bold tabular-nums shrink-0',
                    group.subtotal >= 0 ? 'text-[hsl(var(--positive))]' : 'text-[hsl(var(--negative))]',
                  )}>
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
                          <SavingRow key={e.id} entry={e} bank={bankName(bankIdOf(e))} onDelete={remove} />
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
          onClick={() => { reset(); setAddOpen(true); }}
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
          <DialogTitle>{direction === 'out' ? 'Take money out' : 'Add to savings'}</DialogTitle>
          <DialogDescription>
            {direction === 'out'
              ? 'Comes off the piggybank and back onto this cycle’s balance.'
              : 'Money you put away yourself — leftovers arrive on their own.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {/* Which way the money is going, named rather than toggled — the same two-button
              choice the loan and piggybank sheets use. */}
          <div className="flex gap-1.5">
            {([['in', 'Put in', ArrowDownLeft], ['out', 'Take out', ArrowUpRight]] as const).map(([dir, text, Icon]) => (
              <button
                key={dir}
                onClick={() => { setDirection(dir); if (dir === 'out') setRepeat(false); }}
                className={cn(
                  'flex-1 h-8 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors',
                  direction === dir ? 'bg-accent text-btn-on-accent' : 'bg-muted/40 text-muted-foreground active:bg-muted/70',
                )}
              >
                <Icon className="h-3 w-3" /> {text}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Piggybank</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {banks.map(b => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              placeholder={direction === 'out' ? 'e.g., car repair' : 'e.g., payday transfer'}
              value={label} onChange={e => setLabel(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Recurring turns a movement into a rule: no cycle to pick, because it applies to
              all of them from here on. */}
          {direction === 'in' && (
            <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2.5">
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-sm font-semibold text-foreground">Every cycle</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {repeat
                    ? 'Comes off every cycle from now on until you stop it'
                    : 'One-off — only the cycle you pick below'}
                </p>
              </div>
              <Switch checked={repeat} onCheckedChange={setRepeat} />
            </div>
          )}

          {!repeat && (
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
          )}
          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={submit} className="w-full h-9 text-xs">
            {repeat ? 'Add standing order' : direction === 'out' ? 'Take out' : 'Add to savings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

/** One ledger line. Swipe left to delete (the undo toast is the 5s safety net) or use the
 *  button — the tray is absent entirely when swipe actions are off in settings. */
function SavingRow({ entry, bank, onDelete }: {
  entry: SavingEntry; bank: string; onDelete: (id: string) => void;
}) {
  const out = entry.direction === 'out';
  const auto = entry.source === 'auto';
  const recurring = entry.source === 'recurring';
  return (
    <SwipeableRow
      rightActions={[{ icon: Trash2, label: 'Delete', tone: 'destructive', onAction: () => onDelete(entry.id) }]}
    >
      <div className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {/* Title on its own line, then the chip and the jar under it — the expense row's
              layout, because it is the same kind of line. */}
          <span className="block text-sm font-semibold text-foreground truncate">{entry.label}</span>
          <div className="flex items-center gap-2 mt-1 min-w-0">
            {/* Where it came from, in the app's category chip: every other kind-marker in
                the app (recurring expenses, history types) is this pill. */}
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
              out ? 'bg-negative/15 text-negative'
                : auto ? 'bg-positive/15 text-positive'
                : recurring ? 'bg-snapshot/15 text-snapshot'
                : 'bg-primary/15 text-primary',
            )}>
              {out ? <ArrowUpRight className="h-2.5 w-2.5" />
                : auto ? <Sparkles className="h-2.5 w-2.5" />
                : recurring ? <RotateCcw className="h-2.5 w-2.5" />
                : <ArrowDownLeft className="h-2.5 w-2.5" />}
              {out ? 'Out' : auto ? 'Swept' : recurring ? 'Standing order' : 'Put away'}
            </span>
            <p className="text-xs text-muted-foreground truncate">{bank}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={cn(
            'text-sm font-bold tabular-nums',
            out ? 'text-[hsl(var(--negative))]' : 'text-[hsl(var(--positive))]',
          )}>
            {out ? '−' : '+'}{formatCurrency(entry.amount)}
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
