'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type UnitDef = {
  key: string;
  label: string;
  // For linear units: factor relative to base unit
  factor?: number;
  // For non-linear units (temperature, fuel): custom converters
  toBase?: (v: number) => number;
  fromBase?: (v: number) => number;
};

type Category = {
  key: string;
  label: string;
  emoji: string;
  units: UnitDef[];
};

// ─── Unit Definitions ─────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    key: 'length',
    label: 'Length',
    emoji: '📏',
    units: [
      { key: 'mm',   label: 'Millimetre (mm)',    factor: 0.001 },
      { key: 'cm',   label: 'Centimetre (cm)',    factor: 0.01 },
      { key: 'm',    label: 'Metre (m)',           factor: 1 },
      { key: 'km',   label: 'Kilometre (km)',      factor: 1000 },
      { key: 'in',   label: 'Inch (in)',           factor: 0.0254 },
      { key: 'ft',   label: 'Foot (ft)',           factor: 0.3048 },
      { key: 'yd',   label: 'Yard (yd)',           factor: 0.9144 },
      { key: 'mi',   label: 'Mile (mi)',           factor: 1609.344 },
      { key: 'nmi',  label: 'Nautical Mile',       factor: 1852 },
      { key: 'ly',   label: 'Light-year',          factor: 9.461e15 },
    ],
  },
  {
    key: 'weight',
    label: 'Weight',
    emoji: '⚖️',
    units: [
      { key: 'mcg',  label: 'Microgram (μg)',     factor: 1e-9 },
      { key: 'mg',   label: 'Milligram (mg)',      factor: 1e-6 },
      { key: 'g',    label: 'Gram (g)',            factor: 0.001 },
      { key: 'kg',   label: 'Kilogram (kg)',       factor: 1 },
      { key: 't',    label: 'Metric Ton (t)',      factor: 1000 },
      { key: 'oz',   label: 'Ounce (oz)',          factor: 0.0283495 },
      { key: 'lb',   label: 'Pound (lb)',          factor: 0.453592 },
      { key: 'st',   label: 'Stone (st)',          factor: 6.35029 },
      { key: 'uston',label: 'US Short Ton',        factor: 907.185 },
      { key: 'ukton',label: 'UK Long Ton',         factor: 1016.05 },
    ],
  },
  {
    key: 'temperature',
    label: 'Temp',
    emoji: '🌡️',
    units: [
      {
        key: 'c', label: '°Celsius (°C)',
        toBase: v => v,
        fromBase: v => v,
      },
      {
        key: 'f', label: '°Fahrenheit (°F)',
        toBase: v => (v - 32) * 5 / 9,
        fromBase: v => v * 9 / 5 + 32,
      },
      {
        key: 'k', label: 'Kelvin (K)',
        toBase: v => v - 273.15,
        fromBase: v => v + 273.15,
      },
      {
        key: 'r', label: '°Rankine (°R)',
        toBase: v => (v - 491.67) * 5 / 9,
        fromBase: v => (v + 273.15) * 9 / 5,
      },
    ],
  },
  {
    key: 'area',
    label: 'Area',
    emoji: '⬛',
    units: [
      { key: 'mm2',  label: 'mm²',              factor: 1e-6 },
      { key: 'cm2',  label: 'cm²',              factor: 1e-4 },
      { key: 'm2',   label: 'm²',               factor: 1 },
      { key: 'km2',  label: 'km²',              factor: 1e6 },
      { key: 'in2',  label: 'in²',              factor: 6.4516e-4 },
      { key: 'ft2',  label: 'ft²',              factor: 0.092903 },
      { key: 'yd2',  label: 'yd²',              factor: 0.836127 },
      { key: 'ac',   label: 'Acre',             factor: 4046.86 },
      { key: 'ha',   label: 'Hectare (ha)',      factor: 10000 },
      { key: 'mi2',  label: 'mi²',              factor: 2.59e6 },
    ],
  },
  {
    key: 'volume',
    label: 'Volume',
    emoji: '🧊',
    units: [
      { key: 'ml',      label: 'Millilitre (ml)',       factor: 0.001 },
      { key: 'cl',      label: 'Centilitre (cl)',        factor: 0.01 },
      { key: 'dl',      label: 'Decilitre (dl)',         factor: 0.1 },
      { key: 'l',       label: 'Litre (L)',              factor: 1 },
      { key: 'm3',      label: 'Cubic Metre (m³)',       factor: 1000 },
      { key: 'cm3',     label: 'Cubic cm (cm³)',         factor: 0.001 },
      { key: 'tsp',     label: 'Teaspoon (US)',          factor: 0.00492892 },
      { key: 'tbsp',    label: 'Tablespoon (US)',        factor: 0.0147868 },
      { key: 'floz_us', label: 'Fl Oz (US)',             factor: 0.0295735 },
      { key: 'cup_us',  label: 'Cup (US)',               factor: 0.236588 },
      { key: 'pt_us',   label: 'Pint (US)',              factor: 0.473176 },
      { key: 'qt_us',   label: 'Quart (US)',             factor: 0.946353 },
      { key: 'gal_us',  label: 'Gallon (US)',            factor: 3.78541 },
      { key: 'floz_uk', label: 'Fl Oz (UK)',             factor: 0.0284131 },
      { key: 'pt_uk',   label: 'Pint (UK)',              factor: 0.568261 },
      { key: 'qt_uk',   label: 'Quart (UK)',             factor: 1.13652 },
      { key: 'gal_uk',  label: 'Gallon (UK)',            factor: 4.54609 },
    ],
  },
  {
    key: 'speed',
    label: 'Speed',
    emoji: '🚀',
    units: [
      { key: 'mps',   label: 'm/s',            factor: 1 },
      { key: 'kmh',   label: 'km/h',           factor: 1 / 3.6 },
      { key: 'mph',   label: 'mph',            factor: 0.44704 },
      { key: 'fps',   label: 'ft/s',           factor: 0.3048 },
      { key: 'kn',    label: 'Knot (kn)',       factor: 0.514444 },
      { key: 'mach',  label: 'Mach (sea level)',factor: 340.29 },
      { key: 'c',     label: 'Speed of Light',  factor: 2.998e8 },
    ],
  },
  {
    key: 'time',
    label: 'Time',
    emoji: '⏱️',
    units: [
      { key: 'ns',  label: 'Nanosecond (ns)',   factor: 1e-9 },
      { key: 'ms',  label: 'Millisecond (ms)',  factor: 0.001 },
      { key: 's',   label: 'Second (s)',         factor: 1 },
      { key: 'min', label: 'Minute (min)',       factor: 60 },
      { key: 'hr',  label: 'Hour (hr)',          factor: 3600 },
      { key: 'day', label: 'Day',               factor: 86400 },
      { key: 'wk',  label: 'Week',              factor: 604800 },
      { key: 'mo',  label: 'Month (avg)',        factor: 2629800 },
      { key: 'yr',  label: 'Year (avg)',         factor: 31557600 },
      { key: 'dec', label: 'Decade',            factor: 315576000 },
    ],
  },
  {
    key: 'storage',
    label: 'Data',
    emoji: '💾',
    units: [
      { key: 'bit', label: 'Bit',               factor: 1 },
      { key: 'B',   label: 'Byte (B)',           factor: 8 },
      { key: 'KB',  label: 'Kilobyte (KB)',      factor: 8000 },
      { key: 'MB',  label: 'Megabyte (MB)',      factor: 8e6 },
      { key: 'GB',  label: 'Gigabyte (GB)',      factor: 8e9 },
      { key: 'TB',  label: 'Terabyte (TB)',      factor: 8e12 },
      { key: 'PB',  label: 'Petabyte (PB)',      factor: 8e15 },
      { key: 'KiB', label: 'Kibibyte (KiB)',     factor: 8192 },
      { key: 'MiB', label: 'Mebibyte (MiB)',     factor: 8388608 },
      { key: 'GiB', label: 'Gibibyte (GiB)',     factor: 8589934592 },
    ],
  },
  {
    key: 'pressure',
    label: 'Pressure',
    emoji: '🔩',
    units: [
      { key: 'pa',   label: 'Pascal (Pa)',       factor: 1 },
      { key: 'kpa',  label: 'Kilopascal (kPa)',  factor: 1000 },
      { key: 'mpa',  label: 'Megapascal (MPa)',  factor: 1e6 },
      { key: 'bar',  label: 'Bar',               factor: 100000 },
      { key: 'mbar', label: 'Millibar (mbar)',   factor: 100 },
      { key: 'psi',  label: 'PSI',               factor: 6894.76 },
      { key: 'atm',  label: 'Atmosphere (atm)',  factor: 101325 },
      { key: 'torr', label: 'mmHg / Torr',       factor: 133.322 },
    ],
  },
  {
    key: 'energy',
    label: 'Energy',
    emoji: '⚡',
    units: [
      { key: 'j',   label: 'Joule (J)',          factor: 1 },
      { key: 'kj',  label: 'Kilojoule (kJ)',     factor: 1000 },
      { key: 'mj',  label: 'Megajoule (MJ)',     factor: 1e6 },
      { key: 'cal', label: 'Calorie (cal)',       factor: 4.184 },
      { key: 'kcal',label: 'Kilocalorie (kcal)', factor: 4184 },
      { key: 'wh',  label: 'Watt-hour (Wh)',     factor: 3600 },
      { key: 'kwh', label: 'kWh',                factor: 3600000 },
      { key: 'btu', label: 'BTU',                factor: 1055.06 },
      { key: 'ev',  label: 'Electronvolt (eV)',  factor: 1.602e-19 },
    ],
  },
  {
    key: 'power',
    label: 'Power',
    emoji: '💡',
    units: [
      { key: 'w',    label: 'Watt (W)',           factor: 1 },
      { key: 'kw',   label: 'Kilowatt (kW)',      factor: 1000 },
      { key: 'mw',   label: 'Megawatt (MW)',      factor: 1e6 },
      { key: 'gw',   label: 'Gigawatt (GW)',      factor: 1e9 },
      { key: 'hp_m', label: 'Horsepower (metric)',factor: 735.499 },
      { key: 'hp_i', label: 'Horsepower (imperial)', factor: 745.7 },
      { key: 'btu_h',label: 'BTU/hour',           factor: 0.293071 },
    ],
  },
  {
    key: 'angle',
    label: 'Angle',
    emoji: '📐',
    units: [
      { key: 'deg',  label: 'Degree (°)',         factor: 1 },
      { key: 'rad',  label: 'Radian (rad)',        factor: 180 / Math.PI },
      { key: 'grad', label: 'Gradian (grad)',      factor: 0.9 },
      { key: 'min',  label: 'Arc Minute (\')',     factor: 1 / 60 },
      { key: 'sec',  label: 'Arc Second (")',      factor: 1 / 3600 },
      { key: 'turn', label: 'Full Turn / Rev',     factor: 360 },
    ],
  },
  {
    key: 'fuel',
    label: 'Fuel',
    emoji: '⛽',
    units: [
      // All convert via L/100km as base — reciprocal relationships handled below
      {
        key: 'l100km', label: 'L / 100 km',
        toBase: v => v,
        fromBase: v => v,
      },
      {
        key: 'kml',  label: 'km / L',
        toBase: v => 100 / v,
        fromBase: v => 100 / v,
      },
      {
        key: 'mpg_us', label: 'mpg (US)',
        toBase: v => 235.215 / v,
        fromBase: v => 235.215 / v,
      },
      {
        key: 'mpg_uk', label: 'mpg (UK)',
        toBase: v => 282.481 / v,
        fromBase: v => 282.481 / v,
      },
    ],
  },
];

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12) return n.toExponential(4);
  if (abs >= 1e6)  return n.toLocaleString(undefined, { maximumSignificantDigits: 7 });
  if (abs >= 1)    return +n.toPrecision(7) + '';
  if (abs >= 1e-3) return +n.toPrecision(5) + '';
  return n.toExponential(4);
}

function fmtFactor(f: number): string {
  if (f === 1) return '1';
  const abs = Math.abs(f);
  if (abs >= 1e6 || abs < 1e-4) return f.toExponential(3);
  if (abs >= 100) return +f.toPrecision(6) + '';
  return +f.toPrecision(5) + '';
}

// Returns "× factor" or "÷ factor" string for a linear unit pair
function linearFactor(source: UnitDef, target: UnitDef): string {
  const f = (source.factor ?? 1) / (target.factor ?? 1);
  if (f === 1) return '× 1';
  if (f >= 1) return `× ${fmtFactor(f)}`;
  return `÷ ${fmtFactor(1 / f)}`;
}

// Returns a one-line formula hint for the selected from unit
function formulaHint(source: UnitDef, catKey: string): string {
  switch (catKey) {
    case 'temperature': {
      const f: Record<string, string> = {
        c: '(°C × 9⁄5) + 32 → °F   •   °C + 273.15 → K',
        f: '(°F − 32) × 5⁄9 → °C',
        k: 'K − 273.15 → °C',
        r: '(°R − 491.67) × 5⁄9 → °C',
      };
      return f[source.key] ?? '';
    }
    case 'fuel':
      return 'L/100km ↔ km/L: 100 ÷ x   •   mpg (US): 235.215 ÷ x   •   mpg (UK): 282.481 ÷ x';
    default: {
      const f = source.factor ?? 1;
      const op = f >= 1 ? `× ${fmtFactor(f)}` : `÷ ${fmtFactor(1 / f)}`;
      const name = source.label.replace(/\s*\(.*\)/, '');
      return `1 ${name} ${op} = base unit`;
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MeasurementConverter() {
  const [catKey, setCatKey] = useState('length');
  const [value, setValue] = useState('');
  const [fromUnit, setFromUnit] = useState('mm');
  const [toUnit, setToUnit] = useState('cm');
  const [showAll, setShowAll] = useState(false);

  const cat = CATEGORIES.find(c => c.key === catKey) ?? CATEGORIES[0];

  const handleCatChange = (key: string) => {
    const newCat = CATEGORIES.find(c => c.key === key);
    if (newCat) {
      setCatKey(key);
      setFromUnit(newCat.units[0].key);
      setToUnit(newCat.units[1]?.key ?? newCat.units[0].key);
      setShowAll(false);
      setValue('');
    }
  };

  const handleFromChange = (key: string) => {
    setFromUnit(key);
    if (key === toUnit) {
      const next = cat.units.find(u => u.key !== key);
      if (next) setToUnit(next.key);
    }
  };

  const handleToChange = (key: string) => {
    setToUnit(key);
    if (key === fromUnit) {
      const next = cat.units.find(u => u.key !== key);
      if (next) setFromUnit(next.key);
    }
  };

  const swap = () => { setFromUnit(toUnit); setToUnit(fromUnit); };

  const n = parseFloat(value);
  const hasValue = value !== '' && isFinite(n);

  const sourceUnit = cat.units.find(u => u.key === fromUnit) ?? cat.units[0];
  const targetUnit = cat.units.find(u => u.key === toUnit) ?? cat.units[1];

  const convert = (target: UnitDef): number => {
    if (!hasValue) return 0;
    const base = sourceUnit.toBase
      ? sourceUnit.toBase(n)
      : n * (sourceUnit.factor ?? 1);
    return target.fromBase
      ? target.fromBase(base)
      : base / (target.factor ?? 1);
  };

  const singleResult = convert(targetUnit);
  const isLinearPair = !sourceUnit.toBase && !targetUnit.toBase;

  return (
    <div className="space-y-3">
      {/* Category pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => handleCatChange(c.key)}
            className={cn(
              'flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors',
              catKey === c.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            <span>{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="space-y-1">
        <Label className="text-xs">Amount</Label>
        <Input
          type="number"
          placeholder="Enter value"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
      </div>

      {/* From / Swap / To */}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1 min-w-0">
          <Label className="text-xs">From</Label>
          <Select value={fromUnit} onValueChange={handleFromChange}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cat.units.map(u => (
                <SelectItem key={u.key} value={u.key} className="text-xs">{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          onClick={swap}
          className="mb-0.5 shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-muted/40 hover:bg-muted/70 text-muted-foreground transition-colors"
          title="Swap units"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <div className="flex-1 space-y-1 min-w-0">
          <Label className="text-xs">To</Label>
          <Select value={toUnit} onValueChange={handleToChange}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cat.units.map(u => (
                <SelectItem key={u.key} value={u.key} className="text-xs">{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Formula hint */}
      <div className="rounded-lg bg-muted/20 border border-border/30 px-3 py-2">
        <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-0.5">Formula</p>
        <p className="text-xs text-muted-foreground leading-snug">
          {formulaHint(sourceUnit, catKey)}
          {isLinearPair && (
            <span className="ml-2 text-muted-foreground/50">({linearFactor(sourceUnit, targetUnit)} for this pair)</span>
          )}
        </p>
      </div>

      {/* Single result */}
      {hasValue && !showAll && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-4 text-center">
          <p className="text-3xl font-bold text-foreground font-mono tracking-tight">{fmt(singleResult)}</p>
          <p className="text-xs text-muted-foreground mt-1">{targetUnit.label}</p>
        </div>
      )}

      {/* Show all toggle */}
      {hasValue && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showAll ? 'Show less' : `Show all ${cat.units.length - 1} units`}
        </button>
      )}

      {/* All results */}
      {hasValue && showAll && (
        <div className="space-y-1.5">
          {cat.units.filter(u => u.key !== fromUnit).map(u => {
            const result = convert(u);
            const isLinear = !sourceUnit.toBase && !u.toBase;
            const factor = isLinear ? linearFactor(sourceUnit, u) : null;
            const isSelected = u.key === toUnit;
            return (
              <div
                key={u.key}
                className={cn(
                  'flex items-center rounded-xl px-3 py-2 border gap-2 transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-primary/10 border-primary/25'
                    : 'bg-muted/30 border-border/30 hover:bg-muted/50'
                )}
                onClick={() => { setToUnit(u.key); setShowAll(false); }}
              >
                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs truncate", isSelected ? "text-foreground font-medium" : "text-muted-foreground")}>{u.label}</p>
                  {factor && <p className="text-[10px] text-muted-foreground/50 font-mono">{factor}</p>}
                </div>
                <span className="text-sm font-semibold tabular-nums text-foreground font-mono shrink-0">
                  {fmt(result)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!hasValue && (
        <p className="text-xs text-muted-foreground/50 text-center pt-1">
          Enter a value to convert
        </p>
      )}
    </div>
  );
}
