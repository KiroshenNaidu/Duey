/**
 * Layouts for the card grids on Stats → Overview and Stats → Savings — which cards show, in
 * what order, at what size. Pure data and pure functions; CardGrid does the drawing.
 *
 * The grid is two columns wide, which is what a phone screen fits. A card takes one of
 * three footprints, named the way Android names widget sizes (columns × rows):
 *   • small — 1×1, half the width: one figure, the tile form of the card
 *   • wide  — 2×1, full width: the card as it normally reads
 *   • large — 2×2, full width: everything the card has, charts drawn taller
 *
 * Only the user's CHOICES are stored. Anything the saved layout does not mention (a card
 * added in a later version of the app) falls back to its defaults, and anything it names
 * that no longer exists is dropped, so an old layout can never break a newer page.
 */

export type CardSize = 'small' | 'wide' | 'large';

export const CARD_SIZES: CardSize[] = ['small', 'wide', 'large'];

/** Grid footprint, columns × rows — what the size button shows. */
export const CARD_SIZE_LABEL: Record<CardSize, string> = {
  small: '1×1',
  wide: '2×1',
  large: '2×2',
};

export interface SavedCardLayout {
  /** Every card id the page had when this was saved, in display order (hidden ones too, so a
   *  card that is new since then can be told apart from one the user chose to hide). */
  order: string[];
  sizes: Record<string, CardSize>;
  hidden: string[];
}

/** What a page declares about each of its cards. */
export interface CardSpec {
  id: string;
  /** Sizes this card can be drawn at, in the order the size button cycles through them. */
  sizes: CardSize[];
  defaultSize: CardSize;
  /** Starts tucked away in "Add card" rather than on the page. */
  defaultHidden?: boolean;
}

export interface ResolvedLayout {
  /** Cards on the page, in order, with the size each is drawn at. */
  visible: { id: string; size: CardSize }[];
  /** Cards tucked away, offered by "Add card". */
  hidden: string[];
}

const sizeFor = (spec: CardSpec, saved?: CardSize): CardSize =>
  (saved && spec.sizes.includes(saved) ? saved : spec.defaultSize);

/** The page as it should be drawn: the saved choices laid over the defaults. */
export function resolveLayout(specs: CardSpec[], saved?: SavedCardLayout | null): ResolvedLayout {
  const byId = new Map(specs.map(s => [s.id, s]));
  if (!saved) {
    return {
      visible: specs.filter(s => !s.defaultHidden).map(s => ({ id: s.id, size: s.defaultSize })),
      hidden: specs.filter(s => s.defaultHidden).map(s => s.id),
    };
  }
  const known = saved.order.filter(id => byId.has(id));
  const knownSet = new Set(known);
  // New since the layout was saved: goes at the end, visible unless it defaults to hidden.
  const fresh = specs.filter(s => !knownSet.has(s.id));
  const hiddenSet = new Set([
    ...saved.hidden.filter(id => byId.has(id)),
    ...fresh.filter(s => s.defaultHidden).map(s => s.id),
  ]);
  const order = [...known, ...fresh.map(s => s.id)];
  return {
    visible: order
      .filter(id => !hiddenSet.has(id))
      .map(id => ({ id, size: sizeFor(byId.get(id)!, saved.sizes[id]) })),
    hidden: order.filter(id => hiddenSet.has(id)),
  };
}

/** Back to storable form. Hidden cards keep their place at the end of `order`. */
export function toSaved(layout: ResolvedLayout): SavedCardLayout {
  return {
    order: [...layout.visible.map(c => c.id), ...layout.hidden],
    sizes: Object.fromEntries(layout.visible.map(c => [c.id, c.size])),
    hidden: [...layout.hidden],
  };
}

/** The size after `current` in this card's cycle — what one tap on the size button gives. */
export function nextSize(spec: CardSpec, current: CardSize): CardSize {
  const i = spec.sizes.indexOf(current);
  return spec.sizes[(i + 1) % spec.sizes.length] ?? spec.defaultSize;
}

/** Move one item of a list to another index, returning a new list. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
