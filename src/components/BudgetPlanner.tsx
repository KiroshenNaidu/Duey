'use client';

import { useContext, useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import type { BudgetPlan, BudgetItem } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import { Plus, Trash2, ExternalLink, Edit2 } from 'lucide-react';
import { FixedPortal } from '@/components/FixedPortal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { BudgetGauge } from '@/components/BudgetGauge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

function parseHsl(hsl: string): [number, number, number] {
  const parts = hsl.split(' ');
  return [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])];
}

// Analogous palette: hues rotate around the theme's primary so each ring/legend
// entry is clearly distinct while staying in the same colour family. Driven by
// the active theme, so it re-colours automatically when the theme changes.
function buildAnalogous(primary: string, count: number): string[] {
  const [h, s, l] = parseHsl(primary);
  const norm = (x: number) => ((x % 360) + 360) % 360;
  const n = Math.max(1, count);
  const spread = 18; // degrees between adjacent entries
  const clampL = (v: number) => Math.max(30, Math.min(66, v));
  return Array.from({ length: n }, (_, i) => {
    const offset = i - (n - 1) / 2;
    const hue = norm(h + offset * spread);
    const light = clampL(l + offset * 5);
    return `hsl(${Math.round(hue)}, ${Math.round(s)}%, ${Math.round(light)}%)`;
  });
}

function ItemRow({ item, planBudget, color, onDelete }: {
  item: BudgetItem;
  planBudget: number;
  color: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ratio = planBudget > 0 ? item.price / planBudget : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2.5 w-full text-left py-1.5 rounded-lg transition-colors hover:bg-muted/50 active:bg-muted">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs text-foreground truncate flex-1 min-w-0">{item.name}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-9 text-right">
            {Math.round(ratio * 100)}%
          </span>
          <span className="text-xs font-semibold text-foreground tabular-nums shrink-0 w-20 text-right">
            {formatCurrency(item.price)}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[320px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-base">{item.name}</DialogTitle>
          <DialogDescription className="sr-only">Item details and budget breakdown</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="text-foreground font-bold">{formatCurrency(item.price)}</p>
          <p className="text-xs">{Math.round(ratio * 100)}% of budget</p>
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-accent text-xs underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3" />
              Open link
            </a>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="sm">Close</Button>
          </DialogClose>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove item?</AlertDialogTitle>
                <AlertDialogDescription>This will delete &ldquo;{item.name}&rdquo; from the budget plan.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={cn(buttonVariants({ variant: 'destructive' }))}
                  onClick={() => { onDelete(); setOpen(false); }}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddItemDialog({ plan, onAdd }: { plan: BudgetPlan; onAdd: (item: Omit<BudgetItem, 'id' | 'createdAt'>) => void }) {
  const { updateBudgetPlan } = useContext(AppDataContext);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [link, setLink] = useState('');
  const [overBudget, setOverBudget] = useState(false);
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [newBudgetVal, setNewBudgetVal] = useState('');

  const spent = plan.items.reduce((s, i) => s + i.price, 0);
  const remaining = plan.budget - spent;
  const parsedPrice = parseFloat(price) || 0;

  const resetAll = () => {
    setName(''); setPrice(''); setLink('');
    setOverBudget(false); setShowBudgetEdit(false); setNewBudgetVal('');
  };

  const doAdd = () => {
    onAdd({ name: name.trim(), price: parsedPrice, link: link.trim() || undefined });
    resetAll();
    setOpen(false);
  };

  const handleSubmit = () => {
    if (!name.trim() || parsedPrice <= 0) return;
    if (parsedPrice > remaining) {
      setOverBudget(true);
      setNewBudgetVal(Math.ceil(spent + parsedPrice).toString());
      return;
    }
    doAdd();
  };

  const handleIncreaseBudget = () => {
    const nb = parseFloat(newBudgetVal);
    if (isNaN(nb) || nb <= 0) return;
    updateBudgetPlan(plan.id, { budget: nb });
    doAdd();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetAll(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Add Item
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{overBudget ? 'Over Budget!' : 'Add Budget Item'}</DialogTitle>
          <DialogDescription className="sr-only">Add a new item to your budget plan</DialogDescription>
        </DialogHeader>

        {overBudget ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1.5">
              <p className="text-sm font-semibold text-destructive">
                Exceeds budget by {formatCurrency(parsedPrice - remaining)}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{name}</span> costs {formatCurrency(parsedPrice)} — only{' '}
                <span className="font-medium text-foreground">{formatCurrency(Math.max(0, remaining))}</span> remaining.
              </p>
            </div>
            {showBudgetEdit ? (
              <div className="space-y-2">
                <Label className="text-xs">New Budget (R)</Label>
                <Input
                  type="number"
                  value={newBudgetVal}
                  onChange={e => setNewBudgetVal(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => setShowBudgetEdit(false)}>Back</Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleIncreaseBudget}
                    disabled={!newBudgetVal || parseFloat(newBudgetVal) <= 0}
                  >
                    Save &amp; Add
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button size="sm" className="w-full" onClick={() => setShowBudgetEdit(true)}>
                  Increase Budget
                </Button>
                <Button size="sm" variant="outline" className="w-full" onClick={doAdd}>
                  Add Anyway
                </Button>
                <Button size="sm" variant="ghost" className="w-full text-muted-foreground" onClick={() => setOverBudget(false)}>
                  ← Adjust Price
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-1">
              {remaining >= 0
                ? <>Remaining budget: <span className="font-bold text-foreground">{formatCurrency(remaining)}</span></>
                : <>Budget exceeded by <span className="font-bold text-destructive">{formatCurrency(-remaining)}</span></>
              }
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Item Name</Label>
                <Input placeholder="e.g., Groceries" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price (R)</Label>
                <Input type="number" placeholder="e.g., 1200" value={price} onChange={e => setPrice(e.target.value)} />
                {parsedPrice > 0 && parsedPrice > remaining && (
                  <p className="text-[10px] text-destructive">
                    Exceeds budget by {formatCurrency(parsedPrice - remaining)}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Link (optional)</Label>
                <Input placeholder="https://..." value={link} onChange={e => setLink(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" size="sm">Cancel</Button>
              </DialogClose>
              <Button size="sm" onClick={handleSubmit} disabled={!name.trim() || !price || parsedPrice <= 0}>
                Add
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlanView({ plan }: { plan: BudgetPlan }) {
  const { deleteBudgetPlan, addBudgetItem, deleteBudgetItem, updateBudgetPlan, themeSettings } = useContext(AppDataContext);
  // Largest item first so it maps to the outer ring; colours match by index.
  const sortedItems = useMemo(
    () => [...plan.items].sort((a, b) => b.price - a.price),
    [plan.items]
  );
  const colors = useMemo(
    () => buildAnalogous(themeSettings.primary, sortedItems.length),
    [themeSettings.primary, sortedItems.length]
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(plan.name);
  const [editBudget, setEditBudget] = useState(plan.budget.toString());

  const spent = plan.items.reduce((s, i) => s + i.price, 0);
  const remaining = plan.budget - spent;
  const progress = plan.budget > 0 ? Math.min(100, (spent / plan.budget) * 100) : 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="p-3 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Budget Plan</p>
              <p className="text-sm font-bold text-foreground truncate">{plan.name}</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[320px]">
                  <DialogHeader>
                    <DialogTitle>Edit Plan</DialogTitle>
                    <DialogDescription className="sr-only">Edit the plan name and total budget</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Plan Name</Label>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Budget (R)</Label>
                      <Input type="number" value={editBudget} onChange={e => setEditBudget(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="secondary" size="sm">Cancel</Button></DialogClose>
                    <Button size="sm" onClick={() => {
                      updateBudgetPlan(plan.id, { name: editName, budget: parseFloat(editBudget) || plan.budget });
                      setEditOpen(false);
                    }}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete plan?</AlertDialogTitle>
                    <AlertDialogDescription>This will delete &ldquo;{plan.name}&rdquo; and all its items. This action is logged in history.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className={cn(buttonVariants({ variant: 'destructive' }))} onClick={() => deleteBudgetPlan(plan.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Spent: <span className="font-bold text-foreground">{formatCurrency(spent)}</span></span>
            <span className="text-muted-foreground">Budget: <span className="font-bold text-foreground">{formatCurrency(plan.budget)}</span></span>
          </div>
          {remaining > 0 ? (
            <p className="text-[11px] text-accent font-semibold">{formatCurrency(remaining)} remaining</p>
          ) : (
            <p className="text-[11px] text-destructive font-semibold">Budget reached</p>
          )}
          {plan.items.length > 0 ? (
            <div className="py-2 space-y-3">
              <BudgetGauge items={sortedItems} budget={plan.budget} colors={colors} />
              <div className="space-y-0.5 pt-1">
                {sortedItems.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    planBudget={plan.budget}
                    color={colors[idx % colors.length]}
                    onDelete={() => deleteBudgetItem(plan.id, item.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Progress value={progress} className={cn('h-2', progress >= 100 ? '[&>*]:bg-destructive' : '[&>*]:bg-accent')} />
          )}
        </CardContent>
      </Card>

      {plan.items.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-4">No items yet. Add one below.</p>
      )}

      <div className="flex justify-center">
        <AddItemDialog plan={plan} onAdd={(item) => addBudgetItem(plan.id, item)} />
      </div>
    </div>
  );
}

export function BudgetPlanner() {
  const { budgetPlans, addBudgetPlan } = useContext(AppDataContext);
  const pathname = usePathname();
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planBudget, setPlanBudget] = useState('');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  const activePlan = useMemo(() =>
    budgetPlans.find(p => p.id === activePlanId) ?? budgetPlans[0] ?? null,
    [budgetPlans, activePlanId]
  );

  const handleCreatePlan = () => {
    const b = parseFloat(planBudget);
    if (!planName.trim() || isNaN(b) || b <= 0) return;
    addBudgetPlan(planName.trim(), b);
    setPlanName(''); setPlanBudget('');
    setNewPlanOpen(false);
  };

  return (
    <div className="space-y-3">
      {budgetPlans.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {budgetPlans.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePlanId(p.id)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                (activePlan?.id === p.id)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {activePlan ? (
        <PlanView key={activePlan.id} plan={activePlan} />
      ) : (
        <Card className="text-center">
          <CardContent className="pt-6 pb-4 space-y-2">
            <p className="text-sm font-medium text-foreground">No budget plans yet</p>
            <p className="text-xs text-muted-foreground">Create a plan to start tracking your spending visually.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
        {pathname === '/' && (
          <FixedPortal>
            <DialogTrigger asChild>
              <button
                aria-label="New budget plan"
                className="fixed left-1/2 -translate-x-1/2 h-12 w-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:bg-primary/90 focus:outline-none transition-transform transform hover:scale-105 z-40"
                style={{ bottom: 'calc(10px + var(--sab))' }}
              >
                <Plus className="h-5 w-5" />
              </button>
            </DialogTrigger>
          </FixedPortal>
        )}
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>New Budget Plan</DialogTitle>
            <DialogDescription className="sr-only">Create a new budget plan with a name and total budget amount</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Plan Name</Label>
              <Input placeholder="e.g., June Budget" value={planName} onChange={e => setPlanName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Total Budget (R)</Label>
              <Input type="number" placeholder="e.g., 5000" value={planBudget} onChange={e => setPlanBudget(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" onClick={handleCreatePlan} disabled={!planName.trim() || !planBudget || parseFloat(planBudget) <= 0}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
