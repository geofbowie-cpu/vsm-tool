// helpers.js — shared VSG utilities. Drop-in. No dependencies.

const fmtMoney = (n, opts = {}) => {
  const { compact = false } = opts;
  if (compact && Math.abs(n) >= 1000) {
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + (n / 1000).toFixed(1) + 'K';
  }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const fmtNumber = (n) => n.toLocaleString('en-US');
const fmtPct = (n) => (n * 100).toFixed(0) + '%';

const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtShortDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtAgo = (iso) => {
  if (!iso) return '—';
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return diffMin + 'm ago';
  const h = Math.round(diffMin / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
};

const initialsOf = (name) =>
  (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

const colorOf = (name) => {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 50%)`;
};

const sortRows = (rows, sort) => {
  const arr = rows.slice();
  const dir = sort.dir === 'asc' ? 1 : -1;
  const get = typeof sort.field === 'function' ? sort.field : (r) => r[sort.field];
  arr.sort((a, b) => {
    const va = get(a), vb = get(b);
    if (typeof va === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
  return arr;
};

const filterByRange = (records, range, dateField, todayStr, customRange) => {
  if (range === 'custom') {
    if (!customRange || !customRange.from || !customRange.to) return records;
    return records.filter(r => r[dateField] >= customRange.from && r[dateField] <= customRange.to);
  }
  const today = new Date(todayStr + 'T00:00');
  if (range === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    return records.filter(r => r[dateField] >= monthStart && r[dateField] <= todayStr);
  }
  const cutoff = new Date(today);
  if (range === 'day')  cutoff.setDate(today.getDate() - 1);
  if (range === 'week') cutoff.setDate(today.getDate() - 7);
  const c = cutoff.toISOString().slice(0, 10);
  return records.filter(r => r[dateField] >= c);
};

const monthProgress = (todayStr) => {
  const today = new Date(todayStr + 'T00:00');
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const elapsedDays = (today - start) / 86400000 + 1;
  const totalDays = (end - start) / 86400000 + 1;
  return { elapsedDays, totalDays, remainingDays: totalDays - elapsedDays, pct: elapsedDays / totalDays };
};

Object.assign(window, {
  fmtMoney, fmtNumber, fmtPct,
  fmtDate, fmtShortDate, fmtAgo,
  initialsOf, colorOf,
  sortRows, filterByRange, monthProgress,
});
