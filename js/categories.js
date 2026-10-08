const BUILTIN = {
  expense: [
    { id: 'lebensmittel', label: 'Lebensmittel', icon: '🛒' },
    { id: 'restaurant', label: 'Essen & Café', icon: '🍽️' },
    { id: 'mobilitaet', label: 'Mobilität', icon: '🚗' },
    { id: 'wohnen', label: 'Wohnen', icon: '🏠' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
    { id: 'gesundheit', label: 'Gesundheit', icon: '💊' },
    { id: 'freizeit', label: 'Freizeit', icon: '🎉' },
    { id: 'reisen', label: 'Reisen', icon: '✈️' },
    { id: 'abos', label: 'Abos & Verträge', icon: '📱' },
    { id: 'versicherung', label: 'Versicherungen', icon: '🛡️' },
    { id: 'bildung', label: 'Bildung', icon: '📚' },
    { id: 'geschenke', label: 'Geschenke & Spenden', icon: '🎁' },
    { id: 'sonstiges', label: 'Sonstiges', icon: '📦' },
  ],
  income: [
    { id: 'gehalt', label: 'Gehalt', icon: '💼' },
    { id: 'nebenjob', label: 'Nebenjob', icon: '🧾' },
    { id: 'erstattung', label: 'Erstattung', icon: '↩️' },
    { id: 'geschenk', label: 'Geschenk', icon: '🎁' },
    { id: 'einnahmen', label: 'Sonstige Einnahmen', icon: '💰' },
  ],
};

// User-defined categories: { id, label, icon, type, archived? }. Archived ones stay resolvable for old entries.
let custom = [];

export function setCustomCategories(list) {
  custom = Array.isArray(list) ? list : [];
}

/** Selectable categories for a type; the catch-all built-in ("Sonstiges") stays last. */
export function getCategories(type) {
  const builtin = BUILTIN[type];
  const own = custom.filter((c) => c.type === type && !c.archived);
  return [...builtin.slice(0, -1), ...own, builtin[builtin.length - 1]];
}

export function getCategory(id) {
  return (
    BUILTIN.expense.find((c) => c.id === id) ??
    BUILTIN.income.find((c) => c.id === id) ??
    custom.find((c) => c.id === id) ?? { id, label: id, icon: '❔' }
  );
}
