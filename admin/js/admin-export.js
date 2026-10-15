// SANDRAGON admin — "Export Excel" for any admin list.
// Builds a real .xlsx in the browser with SheetJS (loaded only when the
// button is first clicked, so admin pages don't get slower). If that
// library can't load (offline / blocked), it falls back to a .csv file,
// which Excel also opens.

const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let loading = null;

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SHEETJS_URL;
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('SheetJS missing')));
    s.onerror = () => { loading = null; reject(new Error('Could not load SheetJS')); };
    document.head.appendChild(s);
  });
  return loading;
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// sheets: [{ name: 'Orders', rows: [{ Column: value, ... }] }]
export async function exportToExcel(baseName, sheets) {
  const file = `${baseName}-${stamp()}`;
  const usable = sheets.filter(s => s.rows && s.rows.length);
  if (!usable.length) { alert('Nothing to export in this list.'); return; }
  try {
    const XLSX = await loadSheetJS();
    const wb = XLSX.utils.book_new();
    usable.forEach(({ name, rows }) => {
      const ws = XLSX.utils.json_to_sheet(rows);
      // Reasonable column widths based on the longest value in each column.
      const cols = Object.keys(rows[0]);
      ws['!cols'] = cols.map(c => ({ wch: Math.min(50, Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    XLSX.writeFile(wb, `${file}.xlsx`);
  } catch (err) {
    console.warn('Excel export unavailable, saving CSV instead', err);
    download(new Blob(['﻿' + toCsv(usable[0].rows)], { type: 'text/csv;charset=utf-8' }), `${file}.csv`);
  }
}

export function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}
