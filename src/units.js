// Weights are stored in kilograms. Everything the user sees or the suggestion
// rules work on is in the display unit, converted here.
const KG_PER_LB = 0.45359237;

export const round2 = (n) => Math.round(n * 100) / 100;

export const toDisplay = (kg, unit) =>
  kg == null ? null : unit === 'lb' ? Math.round((kg / KG_PER_LB) * 2) / 2 : round2(kg);

export const toKg = (value, unit) =>
  value == null ? null : unit === 'lb' ? value * KG_PER_LB : value;

export const fmt = (n) => String(round2(n));

const DEFAULT_STEP = {
  barbell: { kg: 2.5, lb: 5 },
  dumbbell: { kg: 2, lb: 5 },
  machine: { kg: 5, lb: 10 },
  cable: { kg: 5, lb: 10 },
};

export const stepFor = (exercise, unit) =>
  exercise.step?.[unit] ?? DEFAULT_STEP[exercise.equip]?.[unit] ?? (unit === 'lb' ? 5 : 2.5);
