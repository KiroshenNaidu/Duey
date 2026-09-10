/**
 * Builds test-data.json — the sample backup shipped for trying the app with a full history.
 *
 *   node scripts/generate-test-data.mjs
 *
 * Writes public/test-data.json — the single copy. It lives under public/ because the dev
 * server has to be able to serve it to load-test-data.js; the README links the same path
 * for the download.
 *
 * WHY a generator and not a hand-written file: the dataset covers every pay cycle from
 * January 2022 to the current one — thousands of transport days, hundreds of payments, a
 * sealed snapshot per cycle — and every one of those figures has to agree with the others,
 * because the app cross-checks them (a cycle's savings leftover IS its snapshot's
 * remaining, the transport figure IS the days ticked on the calendar). Hand-maintaining
 * that is hopeless; regenerating it is one command.
 *
 * Everything random is drawn from a seeded PRNG, so running it twice on the same day
 * produces byte-identical output.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── Anchors ──────────────────────────────────────────────────────────────────

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const PAY_DAY = 26;
const FIRST_CYCLE = { y: 2022, m: 1 };   // the first pay cycle with data
const DAILY_FEE = 96;

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

let seed = 20260911;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = p => rnd() < p;
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const p2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const at = (d, h = 9, min = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min).toISOString();
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

let ids = {};
const id = kind => {
  ids[kind] = (ids[kind] ?? 0) + 1;
  return `${kind}-${String(ids[kind]).padStart(6, '0')}`;
};

// ─── Pay cycles ───────────────────────────────────────────────────────────────
// A cycle is named by the month it STARTS in (`cycleKey` in lib/calculations), runs from
// the 26th to the 25th, and is "sealed" once it has fully elapsed.

const cycleStartOf = (y, m) => new Date(y, m - 1, PAY_DAY);
const currentCycleStart = (() => {
  const s = new Date(TODAY.getFullYear(), TODAY.getMonth(), PAY_DAY);
  return TODAY.getDate() >= PAY_DAY ? s : new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, PAY_DAY);
})();

const cycles = [];
for (let y = FIRST_CYCLE.y, m = FIRST_CYCLE.m; ; ) {
  const start = cycleStartOf(y, m);
  if (start > currentCycleStart) break;
  const end = new Date(y, m, PAY_DAY);            // exclusive: next pay date
  cycles.push({
    key: `${y}-${p2(m)}`,
    start,
    end,
    lastDay: addDays(end, -1),
    sealed: start.getTime() !== currentCycleStart.getTime(),
    label: `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${addDays(end, -1).getDate()} ${MONTHS[addDays(end, -1).getMonth()].slice(0, 3)} ${addDays(end, -1).getFullYear()}`,
  });
  m += 1;
  if (m > 12) { m = 1; y += 1; }
}
const currentCycle = cycles[cycles.length - 1];
/** How the app names a cycle when payday is not the 1st: "26 Jul – 25 Aug 2026". */
const cycleLabel = c =>
  `${c.start.getDate()} ${MONTHS[c.start.getMonth()].slice(0, 3)} – ${c.lastDay.getDate()} ${MONTHS[c.lastDay.getMonth()].slice(0, 3)} ${c.lastDay.getFullYear()}`;

/** Salary the year paid — raises are what make the trend charts worth looking at. */
const salaryFor = date => ({ 2022: 18500, 2023: 21000, 2024: 24500, 2025: 28000 })[date.getFullYear()] ?? 32000;

// ─── People ───────────────────────────────────────────────────────────────────

const LENDERS = ['Sarah Oblivion', 'Mike Fallout', 'Lara Nexus', 'Arthur Redwood', 'Tifa Lockwood'];
const BORROWERS = ['Geralt Rivia', 'Ciri Nova', 'Kratos Mbeki', 'Zelda Naicker', 'Ellie Lastly',
                   'Duke Nukemzi', 'Nathan Drakeford', 'Aloy Nkosi'];

// ─── Output collections ───────────────────────────────────────────────────────

const history = [];
const debts = [];
const loans = [];
const savings = [];
const uberRides = [];
const budgetPlans = [];
const transportOverrides = {};

const push = e => { history.push(e); return e; };

// ─── Transport: every working day since the job started ───────────────────────
// 1 = full day in, 1.5 = half day, 0 = home. Public holidays and a December shutdown
// come out as gaps, and a stretch of leave lands once a year.

const EMPLOYMENT_START = new Date(2022, 0, 3);
const HOLIDAYS = new Set([
  '01-01', '03-21', '04-27', '05-01', '06-16', '08-09', '09-24', '12-16', '12-25', '12-26',
]);

{
  const leaveRuns = [];
  for (let y = 2022; y <= TODAY.getFullYear(); y++) {
    const s = new Date(y, between(0, 10), between(1, 20));
    leaveRuns.push([s, addDays(s, between(4, 11))]);
    leaveRuns.push([new Date(y, 11, 18), new Date(y + 1, 0, 5)]);   // December shutdown
  }
  const onLeave = d => leaveRuns.some(([a, b]) => d >= a && d <= b);

  for (let d = new Date(EMPLOYMENT_START); d <= TODAY; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    if (HOLIDAYS.has(`${p2(d.getMonth() + 1)}-${p2(d.getDate())}`)) continue;
    if (onLeave(d)) continue;
    if (chance(0.04)) continue;                       // sick day / worked from home
    transportOverrides[ymd(d)] = chance(0.08) ? 1.5 : 1;
  }
}

const transportForCycle = c => {
  let total = 0;
  for (let d = new Date(c.start); d < c.end && d <= TODAY; d = addDays(d, 1)) {
    const state = transportOverrides[ymd(d)];
    if (state) total += state === 1.5 ? DAILY_FEE / 2 : DAILY_FEE;
  }
  return Math.round(total);
};

// Every sealed month gets its "marked as paid" record, which is what the Transport card
// reads to stop calling the figure an estimate.
for (const c of cycles) {
  if (!c.sealed) continue;
  const monthLabel = `${MONTHS[c.lastDay.getMonth()]} ${c.lastDay.getFullYear()}`;
  push({
    id: id('h'), debtTitle: `Transport: ${monthLabel}`, date: at(c.lastDay, 17, 30),
    amount: transportForCycle(c), type: 'transport',
  });
}

push({
  id: id('h'), debtTitle: 'Started at Ephemeral Tech', date: at(EMPLOYMENT_START, 8, 0),
  amount: 0, type: 'employment', note: 'Software Developer · daily transport at R96',
});

// ─── Uber rides ───────────────────────────────────────────────────────────────

const PLACES = ['Home', 'Office', 'Gateway Mall', 'Airport', 'Umhlanga', 'Florida Road',
                'Sandton City', 'The Pavilion', 'Mum’s place', 'Gym'];
for (const c of cycles) {
  for (let i = 0, n = between(0, 3); i < n; i++) {
    const day = addDays(c.start, between(0, 28));
    if (day > TODAY) continue;
    const from = pick(PLACES);
    let to = pick(PLACES);
    while (to === from) to = pick(PLACES);
    uberRides.push({
      id: id('u'), date: ymd(day), price: between(45, 260), distance: +(rnd() * 22 + 3).toFixed(1),
      from, to, createdAt: at(day, between(7, 22), between(0, 59)),
    });
  }
}
const uberForCycle = c =>
  uberRides.filter(r => { const d = new Date(r.date + 'T12:00:00'); return d >= c.start && d < c.end; })
           .reduce((s, r) => s + r.price, 0);

// ─── Debts ────────────────────────────────────────────────────────────────────
// `run` is how many installments were actually paid. A debt whose run covers its term is
// closed out with a completion entry; the rest are still on the books.

const DEBT_SPECS = [
  // title, total, installment, dueDay, person, first cycle, months paid, note
  ['Student Loan',            45000, 1200, 26, null,               '2022-01', 34],
  ['Bakkie Finance',         168000, 4200, 30, 'WesBank',          '2022-03', 41],
  ['Dell XPS Laptop',         27000, 1500, 15, 'Sarah Oblivion',   '2022-02', 18, 'settled'],
  ['Wedding Suit',             9600,  800,  5, 'Mike Fallout',     '2022-05', 12, 'settled'],
  ['Gym Contract',            10800,  450,  1, 'Virgin Active',    '2022-07', 24, 'settled'],
  ['Textbooks & Course Fees', 14400, 1200, 20, 'Lara Nexus',       '2023-01', 12, 'settled'],
  ['Emergency Vet Bill',       8400,  700, 10, 'Sarah Oblivion',   '2023-04', 12, 'settled'],
  ['Hospital Excess',         13200, 1100, 28, 'Discovery',        '2023-09', 12, 'settled'],
  ['New Tyres',                9000,  750, 12, 'Mike Fallout',     '2024-02', 12, 'settled'],
  ['Old iPhone 13',            9600,  800, 26, 'Arthur Redwood',   '2024-06', 12, 'settled'],
  ['Home Loan Top-Up',       180000, 4800, 26, 'Standard Bank',    '2024-03', 29],
  ['Samsung Galaxy S24',      11400,  600, 26, 'Vodacom',          '2025-08', 12],
  ['Standard Bank Credit Card', 18000, 900, 26, null,              '2025-10', 10],
  ['Braai & Birthday Money',   6000,  500, 26, 'Sarah Oblivion',   '2025-11', 8],
  ['Borrowed for Rent',       12000, 1000, 26, 'Mike Fallout',     '2026-01', 6],
  ['Tifa’s Camera Loan',  8000,  800, 26, 'Tifa Lockwood',    '2026-03', 4],
  // Second open debts for two people who already have one: the debts list groups a person's
  // cards together, and a dataset with no repeats never shows that.
  ['Couch Money',              4500,  750, 26, 'Sarah Oblivion',   '2026-02', 5],
  ['Bike Parts',               5200,  650, 26, 'Mike Fallout',     '2026-04', 4],
];

for (const [title, total, installment, dueDay, person, firstKey, run, settled] of DEBT_SPECS) {
  const debtId = id('d');
  const firstCycle = cycles.find(c => c.key === firstKey);
  const created = addDays(firstCycle.start, between(0, 4));

  push({
    id: id('h'), debtId, debtTitle: title, date: at(created, between(8, 18)),
    amount: total, type: 'creation', ...(person ? { person } : {}),
  });

  let paid = 0;
  const startIdx = cycles.indexOf(firstCycle);
  for (let i = 0; i < run; i++) {
    const c = cycles[startIdx + i + 1];
    if (!c || !c.sealed) break;
    // A missed month here and there — a history where every payment lands on time teaches
    // nothing about how the app shows a gap.
    if (chance(0.06)) continue;
    const day = addDays(c.start, between(0, 20));
    if (day > TODAY) break;
    const amount = chance(0.12) ? installment + between(1, 6) * 100 : installment;
    paid += amount;
    push({
      id: id('h'), debtId, debtTitle: title, date: at(day, between(8, 20), between(0, 59)),
      amount, type: 'payment', ...(person ? { person } : {}),
      ...(chance(0.15) ? { label: pick(['Extra payment', 'Interest', 'Caught up', 'Double up']) } : {}),
      ...(chance(0.1) ? { note: pick(['Paid by EFT', 'Cash', 'Debit order went off', 'Paid late, sorry']) } : {}),
    });
  }

  if (settled) {
    const done = addDays(cycles[Math.min(startIdx + run + 1, cycles.length - 1)].start, between(1, 15));
    push({
      id: id('h'), debtId, debtTitle: title, date: at(done > TODAY ? TODAY : done, between(9, 19)),
      amount: total, type: 'completion', ...(person ? { person } : {}),
      note: 'Paid off in full',
    });
  } else {
    debts.push({ id: debtId, title, total_owed: total, installment_amount: installment, dueDay, ...(person ? { person } : {}) });
  }
}

const debtForCycle = c =>
  history.filter(h => h.type === 'payment')
         .filter(h => { const d = new Date(h.date); return d >= c.start && d < c.end; })
         .reduce((s, h) => s + h.amount, 0);

// ─── Loans out (Money → Debts → Incoming) ─────────────────────────────────────

const LOAN_SPECS = [
  // person, reason, lent, first cycle, repayments, settledAt?, dueDate offset
  ['Geralt Rivia',    'Gambling',          500, '2026-07', [48]],
  ['Ciri Nova',       'Rent shortfall',   3500, '2026-06', [1000, 1000]],
  ['Kratos Mbeki',    'Car repairs',      2200, '2026-05', [2200], true],
  ['Zelda Naicker',   'Textbooks',        1800, '2026-04', [600, 600]],
  ['Ellie Lastly',    'Groceries',         450, '2026-08', []],
  ['Duke Nukemzi',    'Concert tickets',  1200, '2025-11', [400, 400, 400], true],
  ['Nathan Drakeford','Flight home',      4800, '2025-06', [1200, 1200, 1200]],
  ['Aloy Nkosi',      'Startup money',    6000, '2024-09', [1500, 1500], false, true],
];

for (const [person, reason, lent, firstKey, repayments, settled, overdue] of LOAN_SPECS) {
  const c = cycles.find(k => k.key === firstKey) ?? cycles[0];
  const lentOn = addDays(c.start, between(0, 10));
  const events = [{
    id: id('le'), type: 'lent', amount: lent, date: ymd(lentOn),
    note: pick(['cash', 'EFT', 'handed over in person']), createdAt: at(lentOn, between(8, 20)),
  }];
  // A second hand-out on one loan, because a loan is an event log and not a single number.
  if (chance(0.3)) {
    const more = addDays(lentOn, between(20, 60));
    if (more <= TODAY) {
      events.push({ id: id('le'), type: 'lent', amount: between(2, 9) * 100, date: ymd(more),
                    note: 'lent a bit more', createdAt: at(more, between(8, 20)) });
    }
  }
  repayments.forEach((amount, i) => {
    const back = addDays(lentOn, 25 * (i + 1) + between(0, 8));
    if (back > TODAY) return;
    events.push({ id: id('le'), type: 'repaid', amount, date: ymd(back),
                  note: pick(['cash', 'EFT', 'paid me back at work']), createdAt: at(back, between(8, 20)) });
  });

  loans.push({
    id: id('l'), person, reason, createdAt: at(lentOn, 9),
    ...(overdue ? { dueDate: ymd(addDays(lentOn, 45)) } : {}),
    ...(chance(0.25) ? { note: 'Said they would pay it back after payday.' } : {}),
    ...(settled ? { settledAt: at(addDays(lentOn, 90) > TODAY ? TODAY : addDays(lentOn, 90), 12) } : {}),
    events,
  });
}

// ─── Expenses & extra income ──────────────────────────────────────────────────
// Recurring ones persist; one-offs must sit inside the CURRENT cycle or the boot purge
// clears them the moment the app opens.

const cycleDay = n => addDays(currentCycle.start, n) > TODAY ? TODAY : addDays(currentCycle.start, n);

const expenses = [
  ['Rent',                 6800, true],
  ['Groceries',            3200, true],
  ['Netflix',               229, true],
  ['Spotify Family',        169, true],
  ['Cell Contract',         549, true],
  ['Fibre Internet',        899, true],
  ['Medical Aid',          1450, true],
  ['Gym',                   499, true],
  ['Car Insurance',        1180, true],
  ['Dentist',              1650, false],
  ['Birthday Gift',         600, false],
  ['New Running Shoes',    1899, false],
].map(([title, amount, recurring], i) => ({
  id: id('e'), title, amount,
  date: at(recurring ? currentCycle.start : cycleDay(2 + i), 0),
  createdAt: at(recurring ? new Date(2022, 0, 3) : cycleDay(2 + i), 8),
  recurring,
  ...(title === 'Groceries' ? { note: 'Checkers + Woolies run' } : {}),
}));

const extraIncomes = [
  ['Freelance Design Work', 4200, false],
  ['Marketplace Sales',     1350, false],
  ['Side Gig Retainer',     2500, true],
  ['Rental Income',         3800, true],
].map(([label, amount, recurring], i) => ({
  id: id('i'), label, amount, createdAt: at(recurring ? new Date(2022, 0, 3) : cycleDay(3 + i * 4), 9), recurring,
}));

const recurringExpenseTotal = expenses.filter(e => e.recurring).reduce((s, e) => s + e.amount, 0);
const recurringExtraTotal = extraIncomes.filter(e => e.recurring).reduce((s, e) => s + e.amount, 0);
/** Historic cycles ran cheaper — rent and medical aid climb every year. */
const expensesForCycle = c => {
  const factor = { 2022: 0.68, 2023: 0.76, 2024: 0.85, 2025: 0.93 }[c.start.getFullYear()] ?? 1;
  return Math.round(recurringExpenseTotal * factor) + (chance(0.35) ? between(3, 22) * 100 : 0);
};

// One expense record per sealed cycle, so the History log has expense entries all the way
// back rather than only the live ones above.
for (const c of cycles) {
  if (!c.sealed || chance(0.45)) continue;
  const day = addDays(c.start, between(1, 25));
  push({
    id: id('h'), debtTitle: pick(['Groceries', 'Car service', 'Vet visit', 'School fees', 'Phone screen repair',
                                  'Load-shedding inverter', 'Braai supplies', 'Dentist']),
    date: at(day, between(9, 19)), amount: between(3, 30) * 100, type: 'expense',
  });
}

// ─── Budget plans ─────────────────────────────────────────────────────────────

const PLAN_NAMES = ['Groceries & Household', 'Braai Weekend', 'Back to School', 'December Shopping',
                    'Home Office Setup', 'Camping Trip', 'Birthday Party', 'Winter Clothes',
                    'Car Service Fund', 'Gaming Setup', 'Kitchen Restock', 'Holiday Spending'];
const ITEM_NAMES = ['Rice & pantry staples', 'Cleaning supplies', 'Toiletries', 'Snacks & drinks',
                    'Fresh produce', 'Meat for the week', 'Coffee', 'Batteries', 'Light bulbs',
                    'Dog food', 'Stationery', 'Socks', 'Extension cord', 'Charging cable'];

for (const [i, c] of cycles.entries()) {
  // A plan every few cycles, plus two live ones on the current cycle.
  if (c.sealed && i % 4 !== 1) continue;
  const created = addDays(c.start, between(0, 5));
  if (created > TODAY) continue;
  const budget = between(8, 40) * 100;
  const items = Array.from({ length: between(3, 8) }, () => ({
    id: id('bi'), name: pick(ITEM_NAMES), price: between(4, 60) * 10,
    purchased: c.sealed ? true : chance(0.6), createdAt: at(created, between(9, 18), between(0, 59)),
  }));
  const spent = items.reduce((s, it) => s + it.price, 0);
  const plan = {
    id: id('b'), name: `${MONTHS[c.start.getMonth()].slice(0, 3)} ${PLAN_NAMES[i % PLAN_NAMES.length]}`,
    budget, items, createdAt: at(created, 9),
  };
  if (c.sealed) {
    plan.confirmed = true;
    plan.confirmedAt = at(addDays(c.start, between(6, 25)), 18);
    plan.archived = true;
    push({
      id: id('h'), debtTitle: `Budget: ${plan.name}`, date: plan.confirmedAt, amount: spent,
      type: 'budget', note: `${items.length} items · budget ${budget}`,
    });
  }
  budgetPlans.push(plan);
}

const budgetForCycle = c => budgetPlans
  .filter(p => p.confirmed && p.confirmedAt)
  .filter(p => { const d = new Date(p.confirmedAt); return d >= c.start && d < c.end; })
  .reduce((s, p) => s + p.items.reduce((t, it) => t + it.price, 0), 0);

// ─── Savings: the manual entries first, then each cycle's swept leftover ───────

for (const c of cycles) {
  if (chance(0.55)) continue;
  const day = addDays(c.start, between(1, 25));
  if (day > TODAY) continue;
  savings.push({
    id: id('s'), amount: between(3, 30) * 100, cycleKey: c.key, source: 'manual',
    label: pick(['Emergency fund', 'Tax stash', 'Holiday fund', 'New laptop fund', 'Rainy day',
                 'Bakkie service fund', 'Christmas money']),
    createdAt: at(day, between(9, 20)),
  });
}
const manualSavingsForCycle = c =>
  savings.filter(s => s.source === 'manual' && s.cycleKey === c.key).reduce((s, e) => s + e.amount, 0);

// ─── Sealed-cycle snapshots ───────────────────────────────────────────────────
// Written last, because a snapshot is the sum of everything above it. The leftover a cycle
// banks IS this remaining, so the two are generated from one number.

for (const c of cycles) {
  if (!c.sealed) continue;
  const income = salaryFor(c.start) + recurringExtraTotal + (chance(0.3) ? between(5, 40) * 100 : 0);
  const transport = transportForCycle(c);
  const uber = uberForCycle(c);
  const debt = debtForCycle(c);
  const expense = expensesForCycle(c);
  const budget = budgetForCycle(c);
  const manualSaved = manualSavingsForCycle(c);
  const totalOutgoings = transport + uber + debt + expense + budget + manualSaved;
  const remaining = income - totalOutgoings;

  push({
    id: id('h'),
    // EXACTLY the title AppDataContext's seal writes ("26 Jul – 25 Aug 2026 Summary"): it
    // decides whether a cycle still needs sealing by looking for that string, so any other
    // wording makes the app seal the cycle a second time on first launch.
    debtTitle: `${cycleLabel(c)} Summary`,
    date: c.lastDay.toISOString(),
    amount: Math.abs(remaining),
    type: 'snapshot',
    note: `Income: ${income} | Outgoings: ${totalOutgoings} | ${remaining >= 0 ? 'Surplus' : 'Deficit'}: ${Math.abs(remaining)}`,
    snapshot: { income, transport, uber, debt, expenses: expense, budget, savings: manualSaved, totalOutgoings, remaining },
  });

  // Only a cycle that ends in the black banks anything — same rule as the seal.
  if (remaining > 0) {
    savings.push({
      id: id('s'), amount: remaining, cycleKey: c.key, source: 'auto', label: 'Leftover',
      note: `Left at the end of ${cycleLabel(c)}`,
      createdAt: c.lastDay.toISOString(),
    });
  }
}

history.sort((a, b) => (a.date < b.date ? -1 : 1));
savings.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
uberRides.sort((a, b) => (a.date < b.date ? -1 : 1));

// ─── The backup envelope ──────────────────────────────────────────────────────

const data = {
  _meta: { type: 'duey-backup', v: 2, exportedAt: new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 8).toISOString() },
  schemaVersion: 9,
  currency: 'ZAR',
  monthlyIncome: salaryFor(TODAY),
  debts,
  loans,
  savings,
  history,
  expenses,
  extraIncomes,
  transportSettings: {
    driverName: 'Bra Vusi',
    employed: true,
    pricingMode: 'daily',
    dailyFee: DAILY_FEE,
    monthlyFee: 0,
    jobTitle: 'Software Developer',
    company: 'Ephemeral Tech',
    employmentStartDate: ymd(EMPLOYMENT_START),
  },
  transportOverrides,
  transportMonthlyOverrides: {},
  uberRides,
  budgetPlans,
  userProfile: {
    name: 'Jhon Skyrim',
    paydayDay: PAY_DAY,
    bio: 'Software dev. Owes a bit, is owed a bit more. Fus Roh Debt.',
    avatarSettings: { offsetX: 0, offsetY: -0.05, scale: 1.2 },
  },
  notificationSettings: {
    enabled: true, masterEnabled: true, paydayDay: PAY_DAY, hour: 8, minute: 0,
    message: 'Payday! Don’t forget to log your payments.',
  },
  themeSettings: {
    background: '240 6% 7%', surface: '240 4% 11%', primary: '96 65% 64%', accent: '103 77% 59%',
    font: 'Inter', foreground: '60 8% 95%', accentForeground: '240 3% 62%',
    backgroundOpacity: 0.5, backgroundBlur: 0, uiScale: 1, uiStyle: 'solid', glassOpacity: 0.55,
    useSafeAreaInsets: true, bgX: 50, bgY: 50, bgScale: 1,
    positive: '161 50% 57%', negative: '0 70% 62%', catTransport: '217 91% 68%',
    catBudget: '270 60% 65%', catExpense: '25 95% 53%', catCompletion: '43 96% 70%',
    catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%',
  },
  userThemes: [
    { id: 'theme-aurora-glass', name: 'Aurora Glass', settings: { background: '236 24% 9%', surface: '236 18% 14%', primary: '265 85% 72%', accent: '175 82% 60%', font: 'Inter', foreground: '250 20% 96%', accentForeground: '236 10% 62%', uiStyle: 'glass', glassOpacity: 0.55, backgroundOpacity: 0.5, backgroundBlur: 6, uiScale: 1, useSafeAreaInsets: true, bgX: 50, bgY: 50, bgScale: 1, positive: '161 50% 57%', negative: '0 70% 62%', catTransport: '217 91% 68%', catBudget: '270 60% 65%', catExpense: '25 95% 53%', catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%' } },
    { id: 'theme-mint-minimal', name: 'Mint Minimal', settings: { background: '160 20% 96%', surface: '0 0% 100%', primary: '160 60% 38%', accent: '160 84% 44%', font: 'Inter', foreground: '160 30% 12%', accentForeground: '160 12% 42%', uiStyle: 'solid', glassOpacity: 0.55, backgroundOpacity: 0.5, backgroundBlur: 0, uiScale: 1, useSafeAreaInsets: true, bgX: 50, bgY: 50, bgScale: 1, positive: '161 50% 45%', negative: '0 70% 52%', catTransport: '217 91% 55%', catBudget: '270 60% 55%', catExpense: '25 95% 45%', catCompletion: '43 96% 50%', catEmployment: '173 80% 45%', catSnapshot: '199 89% 50%' } },
    { id: 'theme-sunset-elevated', name: 'Sunset Elevated', settings: { background: '20 20% 8%', surface: '20 14% 13%', primary: '18 92% 62%', accent: '340 82% 66%', font: 'Inter', foreground: '30 25% 95%', accentForeground: '20 10% 60%', uiStyle: 'solid', glassOpacity: 0.55, backgroundOpacity: 0.5, backgroundBlur: 0, uiScale: 1, useSafeAreaInsets: true, bgX: 50, bgY: 50, bgScale: 1, positive: '161 50% 57%', negative: '0 70% 62%', catTransport: '217 91% 68%', catBudget: '270 60% 65%', catExpense: '25 95% 53%', catCompletion: '43 96% 70%', catEmployment: '173 80% 74%', catSnapshot: '199 89% 62%' } },
  ],
  favouriteThemes: ['theme-aurora-glass', 'theme-mint-minimal', 'theme-sunset-elevated', 'midnight', 'forest'],
  hiddenSystemPresets: ['sakura', 'monochrome'],
  dayNight: { enabled: true, dayThemeId: 'theme-mint-minimal', nightThemeId: 'theme-aurora-glass' },
  quickAddFxId: 'ripple',
  quickAddShortcuts: ['payment', 'expense', 'uber', 'budget', 'note', 'income'],
  pageTransitionId: 'slide',
  swipeActionsEnabled: true,
  hapticsStrength: 'medium',
  notepadContent: 'Ask Geralt about the R500 again.\nBakkie service due at 145 000km.\nMove the tax stash before the 25th.',
  exportFolderUri: '',
  exportFolderName: '',
  // The cycle that was live when the app last looked — anything older is already
  // sealed above, so a fresh import seals nothing and duplicates nothing.
  lastSnapshotMonth: currentCycle.key,
  backgroundImage: '',
  backgroundVideo: '',
  avatarImage: '',
};

const json = JSON.stringify(data, null, 1);
writeFileSync(join(ROOT, 'public', 'test-data.json'), json);

const count = t => history.filter(h => h.type === t).length;
console.log(`public/test-data.json written — ${(json.length / 1024).toFixed(0)} KB`);
console.log(`  cycles ${cycles.length} (${cycles[0].key} → ${currentCycle.key})`);
console.log(`  history ${history.length}  (payments ${count('payment')}, snapshots ${count('snapshot')}, transport ${count('transport')}, budget ${count('budget')}, expense ${count('expense')}, creation ${count('creation')}, completion ${count('completion')})`);
console.log(`  debts ${debts.length} open · loans ${loans.length} · savings ${savings.length} · uber ${uberRides.length} · plans ${budgetPlans.length} · transport days ${Object.keys(transportOverrides).length}`);
