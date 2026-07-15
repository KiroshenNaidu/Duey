'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Pencil, Users, Check } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { personKey, derivePersonProfiles, type PersonProfile } from '@/lib/persons';

// The People manager: a roster of everyone you've ever owed, derived from history (there is no
// separate person store). Editing a person renames them everywhere at once — active debts, the
// History log, and the Add-Debt suggestions all read the same data, so they stay in sync. Kept
// name-only for now, but the edit dialog is structured so more fields (colour, note, photo) can
// slot in later without reworking the flow.

// Everyone with a debt on record + which currently have an open debt. Exposed so callers can
// show a summary count (e.g. the History "People" card) from the same derivation the dialog uses.
export function usePeople() {
  const { history, debts } = useContext(AppDataContext);
  return useMemo(() => {
    const people = derivePersonProfiles(history);
    const activeKeys = new Set(debts.map(d => personKey(d.title)));
    // Active people first, then alphabetical — a stable "address book" order.
    people.sort((a, b) => {
      const aActive = activeKeys.has(a.key), bActive = activeKeys.has(b.key);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { people, activeKeys, activeCount: people.filter(p => activeKeys.has(p.key)).length };
  }, [history, debts]);
}

function initialsOf(name: string) {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/);
  return (parts.length === 1 ? parts[0].slice(0, 1) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function EditPersonDialog({ person, open, onClose, onSave, willMergeInto }: {
  person: PersonProfile | null;
  open: boolean;
  onClose: () => void;
  onSave: (fromKey: string, newName: string) => void;
  // If the typed name resolves to a DIFFERENT existing person, editing merges them — surfaced
  // as a hint so a rename onto an existing name is never a silent surprise.
  willMergeInto: (fromKey: string, name: string) => string | null;
}) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open && person) setName(person.name);
  }, [open, person]);

  const trimmed = name.trim();
  const changed = person ? (personKey(trimmed) !== person.key || trimmed !== person.name) : false;
  const mergeTarget = person ? willMergeInto(person.key, trimmed) : null;

  const save = () => {
    if (!person) return;
    if (!trimmed || !changed) { onClose(); return; }
    onSave(person.key, trimmed);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit person</DialogTitle>
          <DialogDescription className="sr-only">Rename this person across all their debts and history.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="person-name" className="text-xs">Name</Label>
          <Input
            id="person-name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
            placeholder="e.g., John"
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground">
            Renames this person on every debt and history entry.
          </p>
          {mergeTarget && (
            <p className="text-[10px] text-accent">Merges with existing person “{mergeTarget}”.</p>
          )}
        </div>

        <DialogFooter className="mt-2 gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!trimmed} className="gap-2">
            <Check className="h-4 w-4" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonRow({ person, active, onEdit }: { person: PersonProfile; active: boolean; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-muted/40 transition-colors">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-sm ring-1 ring-inset ring-primary/25">
        {initialsOf(person.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold text-sm truncate">{person.name}</p>
          <span className={cn(
            'flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
            active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            {active ? 'Active' : 'Settled'}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {person.timesInDebt} debt{person.timesInDebt !== 1 ? 's' : ''} · {formatCurrency(person.totalPaid)} paid
          {person.completions > 0 ? ` · ${person.completions} paid off` : ''}
        </p>
      </div>
      <button
        onClick={onEdit}
        aria-label={`Edit ${person.name}`}
        className="p-2.5 rounded-xl text-muted-foreground/50 active:bg-muted shrink-0"
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

// The popup opened from the History → Debts "People" card. Holds the full editable roster.
export function PeopleManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { renamePerson } = useContext(AppDataContext);
  const { people, activeKeys } = usePeople();
  const [editing, setEditing] = useState<PersonProfile | null>(null);

  // Would a rename land on a *different* person who already exists?
  const willMergeInto = (fromKey: string, name: string): string | null => {
    const targetKey = personKey(name);
    if (!targetKey || targetKey === fromKey) return null;
    return people.find(p => p.key === targetKey)?.name ?? null;
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={16} /> People
          </DialogTitle>
          <DialogDescription>
            Everyone you&apos;ve tracked a debt with. Editing a name updates it everywhere.
          </DialogDescription>
        </DialogHeader>

        {people.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No people yet.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {people.map(p => (
              <PersonRow key={p.key} person={p} active={activeKeys.has(p.key)} onEdit={() => setEditing(p)} />
            ))}
          </div>
        )}

        {/* Nested inside this DialogContent so Radix treats it as a child and doesn't close
            the roster when the edit dialog opens. */}
        <EditPersonDialog
          person={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSave={renamePerson}
          willMergeInto={willMergeInto}
        />
      </DialogContent>
    </Dialog>
  );
}
