# CODEMAP

A file-location index so work can start without grep-ing the tree first.
Duey is a **Next.js (App Router) + Capacitor** personal money/transport app.
All app state is client-side (`AppDataContext`), persisted to disk via Capacitor.

Keep this file updated when files move or big features land.

---

## Entry points & shell

| Path | What it is |
|---|---|
| `src/app/layout.tsx` | Root layout, providers, fonts |
| `src/app/page.tsx` | Home route `/` — renders the Money page |
| `src/app/history/page.tsx` | `/history` route |
| `src/app/stats/page.tsx` | `/stats` route |
| `src/app/transport/page.tsx` | `/transport` route |
| `src/app/settings/page.tsx` | `/settings` route |
| `src/app/globals.css` | Tailwind layers + all CSS custom properties (theme tokens, bar gradients) |
| `src/components/AppShell.tsx` | App frame: nav, safe areas, page carousel |
| `src/components/BottomNav.tsx` | Bottom tab bar |
| `src/components/SwipeTabView.tsx` | Swipeable page carousel (keeps every page mounted) |

## Page-level composers (`src/components/pages/`)

| File | Notes |
|---|---|
| `MoneyPage.tsx` | Tabs: **Tools · Expenses · Debts · Budget · Balance**. `debts` tab renders `<DebtsSection/>` |
| `TransportPage.tsx` | Transport/Uber tracking |
| `StatsPage.tsx` | Charts |
| `SettingsPage.tsx` | Settings menus (see `src/components/settings/`) |

---

## Debts & Loans (the "Debts" tab)

`MoneyPage` → `DebtsSection.tsx` → tab switch between two **separate** ledgers.

| File | Role |
|---|---|
| `src/components/DebtsSection.tsx` | Tab shell. `Payable` = money I owe → `DebtsList`. `Receivable` = money owed to me → `LoansList` |
| `src/components/DebtsList.tsx` | "Payable" ledger. Groups debts by person (`DebtGroup`), press-&-hold multi-select, batch archive/delete |
| `src/components/DebtCard.tsx` | One debt card + its edit/pay/archive/delete dialogs. Tightly coupled to `Debt`, `history`, `lib/calculations` |
| `src/components/DebtGroup` | (inside `DebtsList.tsx`) recessed tray for 2+ debts to the same person |
| `src/components/AddDebtDialog.tsx` / `AddDebtForm.tsx` | Add-a-debt flow |
| `src/components/DebtSemiGauge.tsx` | Semicircle progress gauge used in the debt edit dialog |
| `src/components/DebtCompletionDialog.tsx` | Pay-off celebration (confetti) |
| `src/components/PaymentCalendarDialog.tsx` | Per-debt payment calendar |
| `src/components/DebtProgressCharts.tsx` | Debt charts (stats) |
| `src/lib/calculations.ts` | Debt math: `getAmountPaid`, `getRemainingBalance`, `getPaymentCount`, `displayProgressPct`, `getTotalInstallments` |
| `src/lib/debtReminders.ts` | Due-day reminder logic |
| `src/components/LoansList.tsx` | "Receivable" ledger. Own row/summary/dialogs (`LoanRow`, `AddLoanDialog`, `LoanDetailDialog`). Event-log based |
| `src/lib/loans.ts` | Loan math: `summariseLoans`, `loanLent/Repaid/Outstanding/Progress`, `isLoanSettled/Overdue`, `loanEventsNewestFirst`, `loanLastActivity` |

> **Debts vs Loans are different types on purpose.** A `Debt` is a monthly
> commitment the Balance calc budgets around; a `Loan` is an event log of money
> handed out. They share UI *primitives* (`ui/card`, `SwipeableRow`, `Dialog`,
> `DatePicker`, the `QuickAdd` FAB) but not the debt/loan-specific composites.

## Other Money tabs

| Tab | File(s) |
|---|---|
| Budget | `BudgetPlanner.tsx`, `BudgetGauge.tsx` (`BudgetItem`/`BudgetPlan` in types) |
| Expenses | `ExpensesList.tsx` (`Expense`, `ExtraIncome`) |
| Balance | `MoneyOverview.tsx` |
| Savings | `SavingsTab.tsx` (`SavingEntry`) |
| Tools | `FloatingTools.tsx`, `FloatingCalculator.tsx`, `TimeCalculator.tsx`, `MeasurementConverter.tsx`, `QuickNotepad.tsx` |
| Quick-add | `QuickAdd.tsx` (shared bottom `+` FAB; `usePageFab`, `useFabLongPress`, `FAB_TOUCH_STYLE`, `FabPulse`) |

---

## State & data

| File | Role |
|---|---|
| `src/context/AppDataContext.tsx` | **The single source of truth.** Holds `debts`, `loans`, `history`, `expenses`, budget, transport, profile, theme. Exposes all mutators: `addDebt/updateDebt/deleteDebt/completeDebt/restoreDebt/unarchiveDebt`, `addLoan/updateLoan/deleteLoan/restoreLoan/addLoanEvent/deleteLoanEvent/restoreLoanEvent/setLoanSettled`, `logCustomPayment`, etc. Persists to disk + syncs |
| `src/lib/types.ts` | All shared types: `Debt`, `Loan`, `LoanEvent`, `Expense`, `ExtraIncome`, `SavingEntry`, `HistoryEntry`, `BudgetItem`, `BudgetPlan`, `TransportSettings`, `UberRide`, `ThemeSettings`, `UserProfile`, `NotificationSettings`, `AppState` (= full shape), `AppData` = `Partial<AppState>` |
| `src/lib/persons.ts` | `personKey` (normalise a name for matching), `debtPersonName`, `derivePersonProfiles` |
| `src/lib/folderAccess.ts` | Capacitor folder-access plugin bridge (persistence target) |
| `src/components/settings/DataManagementMenu.tsx` | Import/export/wipe data |
| `docs/backend.json`, `docs/blueprint.md` | Product/design notes |

## History & stats

| File | Role |
|---|---|
| `src/components/HistoryLog.tsx` | `/history` list of `HistoryEntry` rows |
| `src/components/TransportHistoryLog.tsx` | Transport-specific history |
| `src/components/stats/CycleCharts.tsx`, `DebtProgressCharts.tsx` | Charts |

## Transport

| File | Role |
|---|---|
| `src/components/TransportStatusCard.tsx` | Current cycle status |
| `src/components/UberDayDialog.tsx` | Log an Uber day |
| Types: `TransportSettings`, `DayState`, `TransportOverrides`, `UberRide` in `types.ts` |

---

## UI primitives (`src/components/ui/`)

shadcn-style wrappers — **reuse these, don't hand-roll**:
`alert-dialog`, `button` (+ `buttonVariants`), `card` (`Card/CardHeader/CardTitle/CardContent`),
`dialog`, `input`, `label`, `popover`, `progress`, `radio-group`, `scroll-area`,
`select`, `skeleton`, `slider`, `switch`, `tabs`, `textarea`, `undo-toast` (`showUndoToast`),
`date-picker` (also `src/components/DatePicker.tsx`, `TimePicker.tsx`).

Shared non-ui building blocks:
`SwipeableRow.tsx` (swipe-to-reveal actions), `FixedPortal.tsx` (portal to body),
`ErrorBoundary.tsx` / `ErrorModal.tsx`, `LoadingScreen.tsx`, `SuccessCheckmark.tsx`,
`TutorialTour.tsx`.

## Hooks (`src/hooks/`)

| Hook | Use |
|---|---|
| `useReplayOnActive(route)` | Re-fire an animation each time a carousel page becomes active |
| `useLongPress(fn, opts)` | Press-and-hold gesture (multi-select entry) |
| `useDraggablePanel` | Draggable sheet/panel |
| `use-mobile` | Viewport check |

## Lib grab-bag (`src/lib/`)

`utils.ts` (`cn`, `formatCurrency`, `hslToHex`), `haptics.ts` (`hapticTap/hapticTick/hapticImpact`),
`systemThemes.ts`, `radialFx.ts`, `pageTransitions.ts`, `overlayBlur.ts`, `prefetch.ts`,
`quickShortcuts.ts`, `perfFreeze.ts`.

## Native / build

`capacitor.config.ts`, `android/` (Capacitor Android project; custom plugin
`android/app/src/main/java/com/duey/app/FolderAccessPlugin.java`),
`next.config.ts`, `tailwind.config.ts`, `scripts/` (`bump-version`, `gen-icons`, `gen-launcher`).

## Verify a change in the real app

`.claude/skills/verify/SKILL.md` — build, launch, drive Duey with touch + screenshots.
