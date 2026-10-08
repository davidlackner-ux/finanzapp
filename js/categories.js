export const CATEGORIES = {
  expense: [
    { id: 'lebensmittel', label: 'Lebensmittel', icon: '🛒' },
    { id: 'restaurant', label: 'Essen & Café', icon: '🍽️' },
    { id: 'mobilitaet', label: 'Mobilität', icon: '🚗' },
    { id: 'wohnen', label: 'Wohnen', icon: '🏠' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
    { id: 'gesundheit', label: 'Gesundheit', icon: '💊' },
    { id: 'freizeit', label: 'Freizeit', icon: '🎉' },
    { id: 'abos', label: 'Abos & Verträge', icon: '📱' },
    { id: 'bildung', label: 'Bildung', icon: '📚' },
    { id: 'sonstiges', label: 'Sonstiges', icon: '📦' },
  ],
  income: [
    { id: 'gehalt', label: 'Gehalt', icon: '💼' },
    { id: 'nebenjob', label: 'Nebenjob', icon: '🧾' },
    { id: 'geschenk', label: 'Geschenk', icon: '🎁' },
    { id: 'einnahmen', label: 'Sonstige Einnahmen', icon: '💰' },
  ],
};

const ALL = [...CATEGORIES.expense, ...CATEGORIES.income];

export function getCategory(id) {
  return ALL.find((c) => c.id === id) ?? { id, label: id, icon: '❔' };
}
