/* memoraéBUILD Tracker — inventory, sales & profit monitoring.
   Everything runs in the browser; data lives in localStorage (with JSON backup/restore). */
'use strict';
(function () {

  /* =========================================================
     Helpers
     ========================================================= */
  const STORE_KEY = 'memoraebuild-tracker-v1';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
  const round2 = n => Math.round(n * 100) / 100;
  const sum = (arr, f) => arr.reduce((s, x) => s + num(f(x)), 0);
  const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const money = n => { n = num(n); const s = '₱' + Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); return n < 0 ? '−' + s : s; };
  const moneyShort = n => {
    const a = Math.abs(n); let s;
    if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    else if (a >= 1e3) s = (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    else s = String(Math.round(a));
    return (n < 0 ? '−' : '') + '₱' + s.replace(/\.0(?=[kM])/, '');
  };
  const int = n => num(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  const pct = n => Number.isFinite(n) ? (Math.round(n * 1000) / 10).toFixed(1).replace(/\.0$/, '') + '%' : '—';

  const pad2 = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayISO = () => isoDate(new Date());
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON = MONTHS.map(m => m.slice(0, 3));
  const ymKey = s => String(s || '').slice(0, 7);
  const ymLabel = k => { const [y, m] = k.split('-').map(Number); return `${MON[m - 1]} ${y}`; };
  const fmtDate = s => { if (!s) return '—'; const [y, m, d] = String(s).split('-').map(Number); if (!y || !m) return esc(s); return `${MON[m - 1]} ${d}, ${y}`; };
  const shiftDate = (iso, days) => { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + days)); };
  const addMonths = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${pad2(m)}`; };
  const monthRange = k => ({ from: k + '-01', to: k + '-31' });
  const inRange = (d, R) => !!d && d >= R.from && d <= R.to;
  const uniq = arr => {
    const seen = new Map();
    arr.forEach(v => { const t = String(v ?? '').trim(); if (t && !seen.has(norm(t))) seen.set(norm(t), t); });
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  };

  /* =========================================================
     Reference lists
     ========================================================= */
  const OCCASIONS = ['Wedding', 'Birthday', 'Debut', 'Christening', 'Anniversary', 'Graduation', 'Corporate', 'Other'];
  const STAGES = ['Inquiry', 'Confirmed', 'Completed', 'Cancelled'];
  const PAYMENT = ['Unpaid', 'Downpayment', 'Fully Paid'];
  const SOURCES = ['Facebook', 'Instagram', 'TikTok', 'Referral', 'Pop-up market', 'Repeat client', 'Walk-in', 'Other'];
  const POPUP_CATS = [['legoBasic', 'LEGO Basic'], ['hats', 'Hats'], ['hair', 'Hair'], ['animals', 'Animals'], ['flowers', 'Flowers'], ['weapons', 'Weapons'], ['others', 'Others']];
  const ITEM_CATS = ['Body', 'Legs', 'Head / Face', 'Hands', 'Hair', 'Hats', 'Animals', 'Flowers', 'Weapons', 'Accessories', 'Packaging', 'Printing', 'Others'];
  const BASE_CATS = ['Body', 'Legs', 'Head / Face', 'Hands', 'Packaging', 'Printing'];
  const USAGE_REASONS = ['Booking', 'Pop-up sale', 'Damaged / Lost', 'Sample / Display', 'Other'];
  const EXPENSE_CATS = ['Transportation', 'Employee Salary', 'Food', 'Booth Rental', 'Electricity', 'Printing', 'Packaging', 'Bubble Wrap', 'Plastic Bags', 'Receipt Paper', 'Sticker Labels', 'Marketing', 'Internet', 'Repair', 'Equipment', 'Miscellaneous'];
  const TABLE_KEYS = ['bookings', 'popups', 'items', 'usage', 'purchases', 'suppliers', 'expenses', 'payroll', 'transport'];
  const PERIODS = { month: 'This month', lastmonth: 'Last month', quarter: 'Last 3 months', year: 'This year', all: 'All time' };

  /* =========================================================
     State
     ========================================================= */
  function defaultState() {
    return {
      version: 1,
      settings: { businessName: 'memoraéBUILD', tagline: 'LEGO Minifigure Keepsakes', buildPrice: 150, period: 'month', welcomed: false, lastBackup: null, sample: false },
      components: [['Body', 15], ['Legs', 10], ['Hair', 12], ['Face', 8], ['Hands', 4], ['Accessories', 15], ['Packaging', 20], ['Instruction Card', 5], ['Sticker', 4]]
        .map(([name, cost]) => ({ id: uid(), name, cost })),
      bookings: [], popups: [], items: [], usage: [], purchases: [], suppliers: [], expenses: [], payroll: [], transport: []
    };
  }
  function migrate(s) {
    const d = defaultState();
    const out = Object.assign({}, d, s);
    out.settings = Object.assign({}, d.settings, s.settings || {});
    TABLE_KEYS.forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    if (!Array.isArray(out.components)) out.components = d.components;
    return out;
  }
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* storage blocked or corrupt */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save — browser storage is blocked or full. Download a backup now.', true); }
  }
  const hasData = () => TABLE_KEYS.some(k => state[k].length);

  let state = load();
  let CTX = {};                 // per-render cache
  let editing = null;           // {table, id}
  const filters = {};           // per table: {q, month, sort}
  const sticky = {};            // per table: remembered values after "add"
  let calMonth = null, selectedEvent = null, monthlyYear = null, showAllParts = false;

  /* =========================================================
     Business math
     ========================================================= */
  const countsAsSale = b => b.stage !== 'Cancelled' && b.stage !== 'Inquiry';
  const bookingGross = b => num(b.qty) * num(b.price);
  const bookingBalance = b => bookingGross(b) - num(b.downpayment);
  const bookingOutstanding = b => (!countsAsSale(b) || b.payment === 'Fully Paid') ? 0 : Math.max(0, bookingBalance(b));
  const popupPieces = p => POPUP_CATS.reduce((s, [k]) => s + num(p[k]), 0);
  const purchTotal = r => num(r.qty) * num(r.unitCost);
  const payTotal = r => num(r.hours) * num(r.rate) + num(r.fee);
  const trTotal = r => num(r.gas) + num(r.fare) + num(r.parking) + num(r.other);
  const buildCost = () => state.components.reduce((s, c) => s + num(c.cost), 0);
  const eventNames = () => uniq(['bookings', 'popups', 'expenses', 'payroll', 'transport', 'usage'].flatMap(k => state[k].map(r => r.event)));

  function periodRange(p) {
    const now = new Date(); const cur = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    switch (p) {
      case 'month': return monthRange(cur);
      case 'lastmonth': return monthRange(addMonths(cur, -1));
      case 'quarter': return { from: addMonths(cur, -2) + '-01', to: cur + '-31' };
      case 'year': return { from: now.getFullYear() + '-01-01', to: now.getFullYear() + '-12-31' };
      default: return { from: '0000-01-01', to: '9999-12-31' };
    }
  }

  function itemStats() {
    const m = new Map();
    state.items.forEach(it => m.set(norm(it.name), { item: it, purchased: 0, purchCost: 0, used: 0, lastUsed: '' }));
    state.purchases.forEach(p => { const s = m.get(norm(p.item)); if (s) { s.purchased += num(p.qty); s.purchCost += purchTotal(p); } });
    state.usage.forEach(u => { const s = m.get(norm(u.item)); if (s) { s.used += num(u.qty); if ((u.date || '') > s.lastUsed) s.lastUsed = u.date; } });
    m.forEach(s => {
      const it = s.item;
      s.beginning = num(it.beginning);
      s.total = s.beginning + s.purchased;
      s.remaining = s.total - s.used;
      s.reorder = num(it.reorder);
      s.low = s.remaining <= s.reorder;
      s.unitCost = num(it.unitCost) > 0 ? num(it.unitCost) : (s.purchased > 0 ? s.purchCost / s.purchased : 0);
      s.value = Math.max(0, s.remaining) * s.unitCost;
    });
    return m;
  }

  function finance(R) {
    const inR = r => inRange(r.date, R);
    const today = todayISO();
    const B = state.bookings.filter(b => countsAsSale(b) && inR(b) && b.date <= today); // future bookings count once the event happens
    const P = state.popups.filter(inR);
    const X = state.expenses.filter(inR);
    const bookingSales = sum(B, bookingGross);
    const popupSales = sum(P, p => p.sales);
    const revenue = bookingSales + popupSales;
    const supplies = sum(state.purchases.filter(inR), purchTotal);
    const employee = sum(state.payroll.filter(inR), payTotal) + sum(X.filter(x => x.category === 'Employee Salary'), x => x.amount);
    const transport = sum(state.transport.filter(inR), trTotal) + sum(X.filter(x => x.category === 'Transportation'), x => x.amount);
    const cats = {};
    X.forEach(x => {
      if (x.category === 'Employee Salary' || x.category === 'Transportation') return;
      const c = x.category || 'Miscellaneous'; cats[c] = (cats[c] || 0) + num(x.amount);
    });
    const other = Object.values(cats).reduce((a, b) => a + b, 0);
    const expenses = supplies + employee + transport + other;
    const net = revenue - expenses;
    return {
      B, P, bookingSales, popupSales, revenue, supplies, employee, transport, other, cats, expenses, net,
      margin: revenue ? net / revenue : NaN,
      built: sum(B, b => b.qty) + sum(P, p => p.legoBasic),
      pieces: sum(P, popupPieces)
    };
  }
  function expenseBreakdown(f) {
    return [['Supplies (purchases)', f.supplies, 'var(--c-sales)'], ['Employees', f.employee, 'var(--c-pop)'], ['Transportation', f.transport, 'var(--c-exp)'],
      ...Object.entries(f.cats).map(([k, v]) => [k, v, 'var(--faint)'])]
      .filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]).map(([label, value, color]) => ({ label, value, color }));
  }

  function eventsSummary(R) {
    const map = new Map();
    const get = (name, date) => {
      const k = norm(name); if (!k) return null;
      let e = map.get(k);
      if (!e) {
        e = { key: k, name: String(name).trim(), date: date || '', types: new Set(), revenue: 0, bookingRev: 0, popupRev: 0, units: 0, pieces: 0,
          supplies: 0, suppliesLogged: false, suppliesEst: false, employee: 0, transport: 0, cats: {}, other: 0 };
        map.set(k, e);
      }
      if (date && (!e.date || date < e.date)) e.date = date;
      return e;
    };
    const today = todayISO();
    state.bookings.filter(b => countsAsSale(b) && b.date <= today).forEach(b => { const e = get(b.event || b.client, b.date); if (!e) return; e.types.add('Booking'); const g = bookingGross(b); e.revenue += g; e.bookingRev += g; e.units += num(b.qty); });
    state.popups.forEach(p => { const e = get(p.event, p.date); if (!e) return; e.types.add('Pop-up'); e.revenue += num(p.sales); e.popupRev += num(p.sales); e.pieces += popupPieces(p); e.units += num(p.legoBasic); });
    state.usage.forEach(u => { const e = get(u.event, u.date); if (!e) return; const s = CTX.stats.get(norm(u.item)); e.supplies += num(u.qty) * (s ? s.unitCost : 0); e.suppliesLogged = true; });
    state.payroll.forEach(r => { const e = get(r.event, r.date); if (e) e.employee += payTotal(r); });
    state.transport.forEach(r => { const e = get(r.event, r.date); if (e) e.transport += trTotal(r); });
    state.expenses.forEach(x => {
      const e = get(x.event, x.date); if (!e) return;
      if (x.category === 'Employee Salary') e.employee += num(x.amount);
      else if (x.category === 'Transportation') e.transport += num(x.amount);
      else { const c = x.category || 'Miscellaneous'; e.cats[c] = (e.cats[c] || 0) + num(x.amount); e.other += num(x.amount); }
    });
    const bc = buildCost();
    const list = [...map.values()].map(e => {
      if (!e.suppliesLogged && e.units > 0) { e.supplies = e.units * bc; e.suppliesEst = true; }
      e.costs = e.supplies + e.employee + e.transport + e.other;
      e.net = e.revenue - e.costs;
      e.margin = e.revenue ? e.net / e.revenue : NaN;
      e.type = e.types.size > 1 ? 'Mixed' : ([...e.types][0] || 'Costs only');
      return e;
    });
    return R ? list.filter(e => inRange(e.date, R)) : list;
  }
  function unlinkedCosts(R) {
    const f = r => !norm(r.event) && inRange(r.date, R);
    return sum(state.payroll.filter(f), payTotal) + sum(state.transport.filter(f), trTotal) + sum(state.expenses.filter(f), x => x.amount);
  }

  function bestSellers(R, all) {
    const m = new Map();
    state.usage.filter(u => (u.reason === 'Booking' || u.reason === 'Pop-up sale') && inRange(u.date, R)).forEach(u => {
      const k = norm(u.item); const s = CTX.stats.get(k);
      const cat = s ? s.item.category : '';
      if (!all && BASE_CATS.includes(cat)) return;
      let r = m.get(k);
      if (!r) { r = { name: s ? s.item.name : u.item, category: cat, price: s ? num(s.item.sellPrice) : 0, qty: 0 }; m.set(k, r); }
      r.qty += num(u.qty);
    });
    return [...m.values()].map(r => ({ ...r, revenue: r.qty * r.price })).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  }

  function customers() {
    const m = new Map();
    state.bookings.filter(b => b.stage !== 'Cancelled').forEach(b => {
      const k = norm(b.client); if (!k) return;
      let c = m.get(k);
      if (!c) { c = { name: b.client.trim(), contact: '', count: 0, spent: 0, outstanding: 0, first: b.date || '', last: b.date || '', sources: new Set(), occasions: new Set() }; m.set(k, c); }
      c.count++; if (countsAsSale(b)) c.spent += bookingGross(b); c.outstanding += bookingOutstanding(b);
      if (b.contact) c.contact = b.contact;
      if (b.source) c.sources.add(b.source);
      if (b.occasion) c.occasions.add(b.occasion);
      if (b.date && (!c.first || b.date < c.first)) c.first = b.date;
      if (b.date && b.date > c.last) c.last = b.date;
    });
    return [...m.values()];
  }

  /* =========================================================
     Table schemas (the "sheets")
     ========================================================= */
  const itemNames = () => state.items.map(i => i.name).sort((a, b) => a.localeCompare(b));
  const statFor = r => CTX.stats.get(norm(r.name)) || {};

  const SCHEMAS = {
    bookings: {
      title: 'Booking Sales', singular: 'Booking', dated: true, sort: ['date', 'desc'], sticky: [],
      desc: 'Customized keepsake orders — weddings, birthdays, corporate giveaways. Only <b>Confirmed</b> and <b>Completed</b> bookings count as sales; Inquiries are your pipeline.',
      fields: [
        { k: 'date', label: 'Event date', type: 'date', req: true, def: todayISO },
        { k: 'client', label: 'Client', type: 'text', req: true, list: () => uniq(state.bookings.map(b => b.client)) },
        { k: 'contact', label: 'Contact no. / FB', type: 'text' },
        { k: 'occasion', label: 'Occasion', type: 'text', list: () => OCCASIONS, placeholder: 'Wedding' },
        { k: 'event', label: 'Event name', type: 'text', list: eventNames, placeholder: 'Auto: client + occasion + date', hint: 'Use this same name when logging costs for this event.' },
        { k: 'pkg', label: 'Package', type: 'text', placeholder: '100 pax' },
        { k: 'qty', label: 'Qty (pcs)', type: 'number', req: true, step: 1 },
        { k: 'price', label: 'Price per pc', type: 'money', req: true, def: () => state.settings.buildPrice },
        { k: 'downpayment', label: 'Downpayment', type: 'money' },
        { k: 'payment', label: 'Payment status', type: 'select', options: PAYMENT, def: () => 'Downpayment' },
        { k: 'stage', label: 'Booking status', type: 'select', options: STAGES, def: () => 'Confirmed' },
        { k: 'source', label: 'How they found you', type: 'select', options: ['', ...SOURCES], blank: '—' },
        { k: 'notes', label: 'Notes', type: 'text', span: 2 }
      ],
      beforeSave(r) {
        if (!r.event) {
          const [, m, d] = (r.date || '').split('-').map(Number);
          r.event = [r.client, r.occasion].filter(Boolean).join(' ') + (m ? ` – ${MON[m - 1]} ${d}` : '');
        }
      },
      preview: r => [['Gross sales', money(bookingGross(r))], ['Balance', money(bookingBalance(r))]],
      totalIf: countsAsSale, totalLabel: 'Total (confirmed + completed)',
      cols: [
        { k: 'date', label: 'Date', fmt: 'date' },
        { k: 'client', label: 'Client', sub: r => r.contact },
        { k: 'event', label: 'Event', sub: r => r.occasion },
        { k: 'pkg', label: 'Package' },
        { k: 'qty', label: 'Qty', fmt: 'int', total: true },
        { k: 'price', label: 'Price', fmt: 'money' },
        { k: 'gross', label: 'Gross Sales', get: bookingGross, fmt: 'money', total: true },
        { k: 'downpayment', label: 'Downpayment', fmt: 'money', total: true },
        { k: 'balance', label: 'Balance', get: bookingBalance, fmt: 'money', total: true },
        { k: 'payment', label: 'Payment', pill: { 'Fully Paid': 'good', Downpayment: 'warn', Unpaid: 'bad' } },
        { k: 'stage', label: 'Status', pill: { Completed: 'good', Confirmed: 'info', Inquiry: '', Cancelled: 'bad' } }
      ]
    },

    popups: {
      title: 'Pop-up Market Sales', singular: 'Pop-up day', dated: true, sort: ['date', 'desc'], sticky: ['event', 'location'],
      desc: 'One entry per market day (bazaars, fiestas, mall events). Count pieces sold per category and record the cash you made.',
      fields: [
        { k: 'date', label: 'Date', type: 'date', req: true, def: todayISO },
        { k: 'event', label: 'Event / market', type: 'text', req: true, list: eventNames, placeholder: 'Carigara Fiesta' },
        { k: 'location', label: 'Location', type: 'text', list: () => uniq(state.popups.map(p => p.location)) },
        ...POPUP_CATS.map(([k, label]) => ({ k, label, type: 'number', step: 1 })),
        { k: 'sales', label: 'Total sales', type: 'money', req: true },
        { k: 'notes', label: 'Notes', type: 'text', span: 2 }
      ],
      preview: r => [['Total pieces sold', int(popupPieces(r))]],
      cols: [
        { k: 'date', label: 'Date', fmt: 'date' },
        { k: 'event', label: 'Event', sub: r => r.location },
        ...POPUP_CATS.map(([k, label]) => ({ k, label, fmt: 'int', total: true })),
        { k: 'pieces', label: 'Pieces Sold', get: popupPieces, fmt: 'int', total: true },
        { k: 'sales', label: 'Sales', fmt: 'money', total: true }
      ]
    },

    items: {
      title: 'LEGO Inventory', singular: 'Item', dated: false, sort: ['name', 'asc'], sticky: ['category'],
      desc: 'One row per part or accessory. <b>Purchased</b> is pulled from Supply Purchases and <b>Used</b> from Stock Out — you only set the beginning stock and reorder level. Rows turn <span class="neg-text"><b>red</b></span> when stock hits the reorder level.',
      fields: [
        { k: 'name', label: 'Item name', type: 'text', req: true, placeholder: 'Black Hair' },
        { k: 'category', label: 'Category', type: 'select', options: ITEM_CATS, def: () => 'Accessories' },
        { k: 'beginning', label: 'Beginning stock', type: 'number', step: 1, def: () => 0 },
        { k: 'reorder', label: 'Reorder level', type: 'number', step: 1, def: () => 20 },
        { k: 'unitCost', label: 'Unit cost', type: 'money', hint: 'Blank = average purchase cost' },
        { k: 'sellPrice', label: 'Add-on price (optional)', type: 'money', hint: 'If sold separately — used for Best Sellers revenue' }
      ],
      validate(r, id) { if (state.items.some(i => i.id !== id && norm(i.name) === norm(r.name))) return 'An item with this name already exists.'; },
      afterUpdate(old, rec) {
        if (norm(old.name) === norm(rec.name)) return;
        ['purchases', 'usage'].forEach(t => state[t].forEach(r => { if (norm(r.item) === norm(old.name)) r.item = rec.name; }));
      },
      rowClass: r => statFor(r).low ? 'row-low' : '',
      cols: [
        { k: 'name', label: 'Item' },
        { k: 'category', label: 'Category' },
        { k: 'beginning', label: 'Beginning', fmt: 'int', total: true },
        { k: 'purchased', label: 'Purchased', get: r => statFor(r).purchased, fmt: 'int', total: true },
        { k: 'total', label: 'Total Stock', get: r => statFor(r).total, fmt: 'int', total: true },
        { k: 'used', label: 'Used', get: r => statFor(r).used, fmt: 'int', total: true },
        { k: 'remaining', label: 'Remaining', get: r => statFor(r).remaining, fmt: 'int', total: true, cls: r => statFor(r).low ? 'low-cell' : '' },
        { k: 'reorder', label: 'Reorder Level', fmt: 'int' },
        { k: 'unitCost', label: 'Unit Cost', get: r => statFor(r).unitCost, fmt: 'money' },
        { k: 'value', label: 'Stock Value', get: r => statFor(r).value, fmt: 'money', total: true },
        { k: 'status', label: 'Status', get: r => { const s = statFor(r); return s.remaining <= 0 ? 'Out of stock' : s.low ? 'Reorder' : 'OK'; }, pill: { OK: 'good', Reorder: 'bad', 'Out of stock': 'bad' } }
      ]
    },

    usage: {
      title: 'Stock Out', singular: 'Stock-out', dated: true, sort: ['date', 'desc'], sticky: ['date', 'event', 'reason'],
      desc: 'Record parts and accessories used for bookings or sold at pop-ups. This keeps inventory accurate, feeds <b>Best Sellers</b>, and gives each event its real <b>Supplies Used</b> cost. Date, event and reason stay filled so you can log many items quickly.',
      blocker: () => state.items.length ? '' : 'Add your parts and accessories in <a href="#items">Inventory</a> first, then log what you use here.',
      fields: [
        { k: 'date', label: 'Date', type: 'date', req: true, def: todayISO },
        { k: 'event', label: 'Event', type: 'text', list: eventNames, placeholder: 'Event name' },
        { k: 'item', label: 'Item', type: 'select', req: true, options: () => ['', ...itemNames()], blank: 'Choose item…' },
        { k: 'qty', label: 'Qty used', type: 'number', req: true, step: 1 },
        { k: 'reason', label: 'Reason', type: 'select', options: USAGE_REASONS, def: () => 'Booking' },
        { k: 'notes', label: 'Notes', type: 'text' }
      ],
      preview: r => {
        const s = CTX.stats.get(norm(r.item)); if (!s) return [];
        return [['In stock now', int(s.remaining)], ['Cost', money(num(r.qty) * s.unitCost)]];
      },
      cols: [
        { k: 'date', label: 'Date', fmt: 'date' },
        { k: 'event', label: 'Event' },
        { k: 'item', label: 'Item', html: r => esc(r.item) + (CTX.stats.has(norm(r.item)) ? '' : '<span class="tag">not in inventory</span>') },
        { k: 'reason', label: 'Reason', pill: { Booking: 'info', 'Pop-up sale': 'warn', 'Damaged / Lost': 'bad' } },
        { k: 'qty', label: 'Qty', fmt: 'int', total: true },
        { k: 'cost', label: 'Cost', get: r => { const s = CTX.stats.get(norm(r.item)); return num(r.qty) * (s ? s.unitCost : 0); }, fmt: 'money', total: true }
      ]
    },

    purchases: {
      title: 'Supply Purchases', singular: 'Purchase', dated: true, sort: ['date', 'desc'], sticky: ['date', 'supplier'],
      desc: 'Record every restock. When the item name matches an Inventory item, its stock goes up automatically.',
      fields: [
        { k: 'date', label: 'Date', type: 'date', req: true, def: todayISO },
        { k: 'supplier', label: 'Supplier', type: 'text', list: () => uniq([...state.suppliers.map(s => s.name), ...state.purchases.map(p => p.supplier)]), placeholder: 'Shopee' },
        { k: 'item', label: 'Item', type: 'text', req: true, list: itemNames, hint: 'Pick an Inventory item so stock updates.' },
        { k: 'qty', label: 'Qty', type: 'number', req: true, step: 1 },
        { k: 'unitCost', label: 'Unit cost', type: 'money', req: true },
        { k: 'notes', label: 'Notes', type: 'text' }
      ],
      preview: r => [['Total cost', money(purchTotal(r))]],
      cols: [
        { k: 'date', label: 'Date', fmt: 'date' },
        { k: 'supplier', label: 'Supplier' },
        { k: 'item', label: 'Item', html: r => esc(r.item) + (CTX.stats.has(norm(r.item)) ? '' : '<span class="tag">not in inventory</span>') },
        { k: 'qty', label: 'Qty', fmt: 'int', total: true },
        { k: 'unitCost', label: 'Unit Cost', fmt: 'money' },
        { k: 'total', label: 'Total Cost', get: purchTotal, fmt: 'money', total: true }
      ]
    },

    suppliers: {
      title: 'Suppliers', singular: 'Supplier', dated: false, sort: ['name', 'asc'], sticky: [],
      desc: 'Where you buy parts, packaging and printing — with contact details and how long orders take to arrive.',
      fields: [
        { k: 'name', label: 'Supplier name', type: 'text', req: true },
        { k: 'contact', label: 'Contact / link', type: 'text' },
        { k: 'platform', label: 'Platform', type: 'text', list: () => ['Shopee', 'Lazada', 'TikTok Shop', 'Facebook', 'Local shop'] },
        { k: 'leadTime', label: 'Lead time (days)', type: 'number', step: 1 },
        { k: 'notes', label: 'Notes', type: 'text', span: 2 }
      ],
      validate(r, id) { if (state.suppliers.some(s => s.id !== id && norm(s.name) === norm(r.name))) return 'A supplier with this name already exists.'; },
      afterUpdate(old, rec) { if (norm(old.name) !== norm(rec.name)) state.purchases.forEach(p => { if (norm(p.supplier) === norm(old.name)) p.supplier = rec.name; }); },
      cols: [
        { k: 'name', label: 'Supplier', sub: r => r.notes },
        { k: 'contact', label: 'Contact' },
        { k: 'platform', label: 'Platform' },
        { k: 'leadTime', label: 'Lead Time', get: r => r.leadTime === '' || r.leadTime == null ? '' : r.leadTime + ' days' },
        { k: 'orders', label: 'Orders', get: r => state.purchases.filter(p => norm(p.supplier) === norm(r.name)).length, fmt: 'int', total: true },
        { k: 'spent', label: 'Total Spent', get: r => sum(state.purchases.filter(p => norm(p.supplier) === norm(r.name)), purchTotal), fmt: 'money', total: true },
        { k: 'last', label: 'Last Order', get: r => state.purchases.filter(p => norm(p.supplier) === norm(r.name)).map(p => p.date).sort().pop() || '', fmt: 'date' }
      ]
    },

    expenses: {
      title: 'Operating Expenses', singular: 'Expense', dated: true, sort: ['date', 'desc'], sticky: ['date', 'event'],
      desc: 'Food, booth rental, electricity, packaging, marketing and everything else. Link an expense to an event to see that event\'s true profit; leave the event blank for general business costs.',
      fields: [
        { k: 'date', label: 'Date', type: 'date', req: true, def: todayISO },
        { k: 'category', label: 'Category', type: 'select', req: true, options: EXPENSE_CATS, def: () => 'Food' },
        { k: 'event', label: 'Event (optional)', type: 'text', list: eventNames },
        { k: 'description', label: 'Description', type: 'text' },
        { k: 'amount', label: 'Amount', type: 'money', req: true }
      ],
      cols: [
        { k: 'date', label: 'Date', fmt: 'date' },
        { k: 'category', label: 'Category' },
        { k: 'event', label: 'Event' },
        { k: 'description', label: 'Description', cls: () => 'wrap' },
        { k: 'amount', label: 'Amount', fmt: 'money', total: true }
      ]
    },

    payroll: {
      title: 'Employee Payroll', singular: 'Payroll entry', dated: true, sort: ['date', 'desc'], sticky: ['date', 'event', 'rate'],
      desc: 'What you pay helpers per event — by the hour, a flat fee, or both.',
      fields: [
        { k: 'date', label: 'Date', type: 'date', req: true, def: todayISO },
        { k: 'event', label: 'Event', type: 'text', list: eventNames },
        { k: 'employee', label: 'Employee', type: 'text', req: true, list: () => uniq(state.payroll.map(p => p.employee)) },
        { k: 'hours', label: 'Hours', type: 'number', step: 0.5 },
        { k: 'rate', label: 'Rate per hour', type: 'money', def: () => 80 },
        { k: 'fee', label: 'Flat fee / allowance', type: 'money' }
      ],
      preview: r => [['Total pay', money(payTotal(r))]],
      cols: [
        { k: 'date', label: 'Date', fmt: 'date' },
        { k: 'event', label: 'Event' },
        { k: 'employee', label: 'Employee' },
        { k: 'hours', label: 'Hours', fmt: 'int', total: true },
        { k: 'rate', label: 'Rate', fmt: 'money' },
        { k: 'fee', label: 'Flat Fee', fmt: 'money', total: true },
        { k: 'total', label: 'Total', get: payTotal, fmt: 'money', total: true }
      ]
    },

    transport: {
      title: 'Transportation', singular: 'Trip', dated: true, sort: ['date', 'desc'], sticky: ['date', 'event'],
      desc: 'Gas, fares and parking for every trip — to events, suppliers or deliveries.',
      fields: [
        { k: 'date', label: 'Date', type: 'date', req: true, def: todayISO },
        { k: 'event', label: 'Event', type: 'text', list: eventNames },
        { k: 'destination', label: 'Destination', type: 'text', list: () => uniq(state.transport.map(t => t.destination)) },
        { k: 'gas', label: 'Gas', type: 'money' },
        { k: 'fare', label: 'Fare', type: 'money' },
        { k: 'parking', label: 'Parking', type: 'money' },
        { k: 'other', label: 'Other (tolls, etc.)', type: 'money' }
      ],
      preview: r => [['Trip total', money(trTotal(r))]],
      cols: [
        { k: 'date', label: 'Date', fmt: 'date' },
        { k: 'event', label: 'Event' },
        { k: 'destination', label: 'Destination' },
        { k: 'gas', label: 'Gas', fmt: 'money', total: true },
        { k: 'fare', label: 'Fare', fmt: 'money', total: true },
        { k: 'parking', label: 'Parking', fmt: 'money', total: true },
        { k: 'other', label: 'Other', fmt: 'money', total: true },
        { k: 'total', label: 'Total', get: trTotal, fmt: 'money', total: true }
      ]
    }
  };

  /* =========================================================
     Small UI builders
     ========================================================= */
  const pageHead = (title, desc, right = '') =>
    `<header class="page-head"><div><h1>${esc(title)}</h1>${desc ? `<p>${desc}</p>` : ''}</div>${right ? `<div class="head-right">${right}</div>` : ''}</header>`;
  const periodPicker = () =>
    `<div class="seg" role="group" aria-label="Period">${Object.entries(PERIODS).map(([k, l]) => `<button type="button" data-period="${k}" class="${state.settings.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const stat = (label, value, sub = '', tone = '') =>
    `<div class="stat ${tone}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;
  const signed = n => `<span class="${n < 0 ? 'neg-text' : ''}">${money(n)}</span>`;

  function toast(msg, bad) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast' + (bad ? ' bad' : ''); }, bad ? 4200 : 2200);
  }

  function niceTicks(min, max, n) {
    const span = max - min || 1;
    const raw = span / n; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(round2(v));
    return out;
  }
  function barChart(labels, series, opts = {}) {
    const mw = ($('#main') || {}).clientWidth || 900;
    const W = Math.round(Math.max(300, Math.min(1240, mw - (mw < 860 ? 74 : 106)))), H = opts.h || 260, L = 58, Rp = 8, T = 12, Bm = 28;
    const all = series.flatMap(s => s.values);
    let max = Math.max(0, ...all), min = Math.min(0, ...all);
    if (max === min) max = min + 1000;
    const ticks = niceTicks(min, max, 4); const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = v => T + (hi - v) / (hi - lo) * (H - T - Bm);
    const gw = (W - L - Rp) / labels.length; const bw = Math.min(24, gw * 0.8 / series.length);
    let g = '';
    ticks.forEach(t => { g += `<line x1="${L}" x2="${W - Rp}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'axis0' : 'grid'}"/><text x="${L - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${moneyShort(t)}</text>`; });
    labels.forEach((lab, i) => {
      const cx = L + gw * i + gw / 2; const start = cx - bw * series.length / 2;
      series.forEach((s, j) => {
        const v = s.values[i] || 0; if (!v) return;
        const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        const fill = typeof s.color === 'function' ? s.color(v) : s.color;
        g += `<rect x="${start + j * bw + 1}" y="${y0}" width="${Math.max(1, bw - 2)}" height="${Math.max(1.5, y1 - y0)}" rx="2.5" fill="${fill}"><title>${esc(lab)} · ${esc(s.name)}: ${money(v)}</title></rect>`;
      });
      g += `<text x="${cx}" y="${H - 8}" class="tick" text-anchor="middle">${esc(lab)}</text>`;
    });
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Chart')}">${g}</svg>
      <div class="legend">${series.map(s => `<span><i style="background:${s.legend || s.color}"></i>${esc(s.name)}</span>`).join('')}</div></div>`;
  }
  function hbars(rows, opts = {}) {
    if (!rows.length) return `<p class="empty">${opts.empty || 'No data yet.'}</p>`;
    const fmt = opts.fmt || money;
    const max = Math.max(...rows.map(r => r.value), 1);
    return `<ul class="hbars">${rows.map(r => `<li><div class="hb-top"><span>${esc(r.label)}</span><b>${fmt(r.value)}</b></div>
      <div class="hb-track"><div class="hb-fill" style="width:${Math.max(1.5, r.value / max * 100)}%;background:${r.color || opts.color || 'var(--c-sales)'}"></div></div>${r.sub ? `<small>${r.sub}</small>` : ''}</li>`).join('')}</ul>`;
  }
  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function exportCSV(key, rows) {
    const S = SCHEMAS[key]; rows = rows || state[key];
    const lines = [S.cols.map(c => csvCell(c.label)).join(',')];
    rows.forEach(r => lines.push(S.cols.map(c => { const v = cellVal(c, r); return csvCell(typeof v === 'number' ? round2(v) : v); }).join(',')));
    downloadFile(`memoraebuild-${key}-${todayISO()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  /* =========================================================
     Generic table page (the data-entry sheets)
     ========================================================= */
  const cellVal = (c, r) => { const v = c.get ? c.get(r) : r[c.k]; return (c.fmt === 'money' || c.fmt === 'int') ? num(v) : (v ?? ''); };
  function cellHtml(c, r) {
    if (c.html) return c.html(r);
    const raw = c.get ? c.get(r) : r[c.k];
    let out;
    if (c.pill) out = raw ? `<span class="pill ${c.pill[raw] || ''}">${esc(raw)}</span>` : '<span class="muted">—</span>';
    else if (c.fmt === 'money') out = raw === '' || raw == null ? '<span class="muted">—</span>' : signed(num(raw));
    else if (c.fmt === 'int') out = raw === '' || raw == null ? '<span class="muted">—</span>' : int(raw);
    else if (c.fmt === 'date') out = raw ? fmtDate(raw) : '<span class="muted">—</span>';
    else out = raw === '' || raw == null ? '<span class="muted">—</span>' : esc(raw);
    const sub = c.sub && c.sub(r);
    return out + (sub ? `<small>${esc(sub)}</small>` : '');
  }

  function fieldInput(f, val) {
    const id = 'f_' + f.k;
    const v = val ?? '';
    const req = f.req ? ' required' : '';
    let input;
    if (f.type === 'select') {
      const opts = (typeof f.options === 'function' ? f.options() : f.options).slice();
      if (v && !opts.includes(v)) opts.push(v);
      input = `<select id="${id}" name="${f.k}"${req}>${opts.map(o => `<option value="${esc(o)}"${String(o) === String(v) ? ' selected' : ''}>${esc(o || f.blank || '—')}</option>`).join('')}</select>`;
    } else {
      const isNum = f.type === 'money' || f.type === 'number';
      const type = isNum ? 'number' : f.type === 'date' ? 'date' : 'text';
      const extra = isNum ? ` step="${f.type === 'money' ? '0.01' : (f.step ?? 'any')}" min="0" inputmode="decimal"` : '';
      const list = f.list ? ` list="dl_${f.k}"` : '';
      input = `<input id="${id}" name="${f.k}" type="${type}"${extra} value="${esc(v)}"${list}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${req} autocomplete="off">`;
      if (f.list) input += `<datalist id="dl_${f.k}">${f.list().map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
      if (f.type === 'money') input = `<span class="with-affix"><span class="affix">₱</span>${input}</span>`;
    }
    return `<label class="field${f.span ? ' span-' + f.span : ''}" for="${id}"><span class="lbl">${esc(f.label)}${f.req ? ' <b class="req">*</b>' : ''}</span>${input}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}</label>`;
  }
  function readForm(form, S) {
    const r = {};
    S.fields.forEach(f => {
      const el = form.querySelector(`[name="${f.k}"]`); if (!el) return; // not form.elements[k]: "item" collides with elements.item()
      const v = el.value;
      r[f.k] = (f.type === 'money' || f.type === 'number') ? (v === '' ? '' : num(v)) : v.trim();
    });
    return r;
  }

  function renderTable(main, key) {
    const S = SCHEMAS[key];
    const F = filters[key] || (filters[key] = { q: '', month: '', sort: S.sort || null });
    const rec = editing && editing.table === key ? state[key].find(r => r.id === editing.id) : null;
    if (editing && editing.table === key && !rec) editing = null;
    const blocker = S.blocker && S.blocker();
    const initial = f => rec ? rec[f.k] : (sticky[key] && sticky[key][f.k] !== undefined ? sticky[key][f.k] : (f.def ? f.def() : ''));
    const months = S.dated ? uniq(state[key].map(r => ymKey(r.date))).sort().reverse() : [];

    main.innerHTML = `
      ${pageHead(S.title, S.desc, key === 'items' ? `<a class="btn sm" href="#purchases">+ Record purchase</a><a class="btn sm" href="#usage">− Stock out</a>` : '')}
      ${key === 'items' ? inventorySummary() : ''}
      <section class="card form-card${rec ? ' is-editing' : ''}" id="formCard">
        <div class="card-head"><h2>${rec ? 'Edit ' : 'Add '}${esc(S.singular.toLowerCase())}</h2>${rec ? '<span class="pill info">Editing</span>' : ''}</div>
        ${blocker ? `<p class="empty">${blocker}</p>` : `
        <form id="recForm" novalidate>
          <div class="fgrid">${S.fields.map(f => fieldInput(f, initial(f))).join('')}</div>
          <div class="form-foot">
            <div class="preview" id="preview"></div>
            <div class="btns">
              ${rec ? '<button type="button" class="btn ghost" data-act="cancel">Cancel</button>' : '<button type="reset" class="btn ghost" data-act="clear">Clear</button>'}
              <button class="btn primary" type="submit">${rec ? 'Save changes' : 'Add ' + esc(S.singular.toLowerCase())}</button>
            </div>
          </div>
        </form>`}
      </section>
      <section class="card">
        <div class="toolbar">
          <input type="search" id="q" placeholder="Search…" value="${esc(F.q)}" aria-label="Search">
          ${S.dated ? `<select id="monthFilter" aria-label="Filter by month"><option value="">All months</option>${months.map(m => `<option value="${m}"${F.month === m ? ' selected' : ''}>${ymLabel(m)}</option>`).join('')}</select>` : ''}
          <span class="count" id="count"></span>
          <button class="btn sm" data-act="csv" data-table="${key}">Export CSV</button>
        </div>
        <div class="table-wrap" id="list"></div>
      </section>`;

    const form = $('#recForm');
    if (form) {
      const upd = () => {
        const r = readForm(form, S);
        $('#preview').innerHTML = S.preview ? S.preview(r).map(([l, v]) => `<span>${esc(l)}: <b>${v}</b></span>`).join('') : '';
      };
      form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
      form.addEventListener('reset', () => { sticky[key] = {}; setTimeout(() => { render(); }, 0); });
      form.addEventListener('submit', e => {
        e.preventDefault();
        $$('input,select', form).forEach(el => el.classList.toggle('invalid', !el.checkValidity()));
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const r = readForm(form, S);
        const err = S.validate && S.validate(r, rec && rec.id);
        if (err) { toast(err, true); return; }
        if (S.beforeSave) S.beforeSave(r);
        if (rec) {
          const old = { ...rec }; Object.assign(rec, r);
          if (S.afterUpdate) S.afterUpdate(old, rec);
          editing = null; toast('Changes saved');
        } else {
          r.id = uid(); r.created = Date.now(); state[key].push(r);
          sticky[key] = {}; (S.sticky || []).forEach(k => { sticky[key][k] = r[k]; });
          toast(S.singular + ' added');
        }
        save(); render();
        const first = S.fields.find(f => !(S.sticky || []).includes(f.k));
        const el = first && $('#f_' + first.k); if (el && !rec) el.focus({ preventScroll: true });
      });
    }
    $('#q').addEventListener('input', e => { F.q = e.target.value; drawList(key); });
    const mf = $('#monthFilter'); if (mf) mf.addEventListener('change', e => { F.month = e.target.value; drawList(key); });
    drawList(key);
    if (rec) $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function filteredRows(key) {
    const S = SCHEMAS[key], F = filters[key];
    let rows = state[key].slice();
    if (F.month) rows = rows.filter(r => ymKey(r.date) === F.month);
    if (F.q) { const q = norm(F.q); rows = rows.filter(r => S.cols.some(c => norm(cellVal(c, r)).includes(q)) || norm(r.notes).includes(q)); }
    if (F.sort) {
      const [k, dir] = F.sort; const c = S.cols.find(c => c.k === k) || { k };
      rows.sort((a, b) => {
        const va = cellVal(c, a), vb = cellVal(c, b);
        const d = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
        return (dir === 'desc' ? -d : d) || (b.created || 0) - (a.created || 0);
      });
    }
    return rows;
  }
  function drawList(key) {
    const S = SCHEMAS[key], F = filters[key];
    const rows = filteredRows(key);
    $('#count').textContent = `${rows.length} of ${state[key].length} ${rows.length === 1 ? 'entry' : 'entries'}`;
    if (!state[key].length) { $('#list').innerHTML = `<p class="empty">Nothing recorded yet — add your first ${esc(S.singular.toLowerCase())} above.</p>`; return; }
    if (!rows.length) { $('#list').innerHTML = `<p class="empty">No entries match your search.</p>`; return; }
    const isNum = c => c.fmt === 'money' || c.fmt === 'int';
    const totRows = S.totalIf ? rows.filter(S.totalIf) : rows;
    const hasTotals = S.cols.some(c => c.total);
    $('#list').innerHTML = `<table>
      <thead><tr>${S.cols.map(c => `<th data-sort="${c.k}" data-table="${key}" class="${isNum(c) ? 'num' : ''}">${esc(c.label)}${F.sort && F.sort[0] === c.k ? ` <span class="arrow">${F.sort[1] === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`).join('')}<th class="actions"></th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${S.rowClass ? S.rowClass(r) : ''}">${S.cols.map(c => `<td class="${isNum(c) ? 'num ' : ''}${c.cls ? c.cls(r) : ''}">${cellHtml(c, r)}</td>`).join('')}
        <td class="actions"><button class="link-btn" data-act="edit" data-table="${key}" data-id="${r.id}">Edit</button><button class="link-btn del" data-act="del" data-table="${key}" data-id="${r.id}">Delete</button></td></tr>`).join('')}</tbody>
      ${hasTotals ? `<tfoot><tr>${S.cols.map((c, i) => `<td class="${isNum(c) ? 'num' : ''}">${c.total ? (c.fmt === 'money' ? signed(sum(totRows, r => cellVal(c, r))) : int(sum(totRows, r => cellVal(c, r)))) : (i === 0 ? esc(S.totalLabel || 'Total') : '')}</td>`).join('')}<td></td></tr></tfoot>` : ''}
    </table>`;
  }

  function inventorySummary() {
    const st = [...CTX.stats.values()];
    const low = st.filter(s => s.low);
    return `<div class="stats">
      ${stat('Items tracked', int(st.length))}
      ${stat('Pieces on hand', int(sum(st, s => Math.max(0, s.remaining))))}
      ${stat('Stock value', money(sum(st, s => s.value)))}
      ${stat('Need reorder', int(low.length), low.length ? low.slice(0, 3).map(s => esc(s.item.name)).join(', ') + (low.length > 3 ? '…' : '') : 'All stocked', low.length ? 'neg' : 'pos')}
    </div>`;
  }

  /* =========================================================
     Dashboard
     ========================================================= */
  function renderDashboard(main) {
    const R = periodRange(state.settings.period);
    const f = finance(R);
    const st = [...CTX.stats.values()];
    const low = st.filter(s => s.low).sort((a, b) => (a.remaining - a.reorder) - (b.remaining - b.reorder));
    const now = new Date(); const cur = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    const months = Array.from({ length: 12 }, (_, i) => addMonths(cur, i - 11));
    const mf = months.map(k => finance(monthRange(k)));
    const today = todayISO();
    const upcoming = state.bookings.filter(b => b.date >= today && b.stage !== 'Cancelled' && b.stage !== 'Completed').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const owed = state.bookings.filter(b => bookingOutstanding(b) > 0).sort((a, b) => a.date.localeCompare(b.date));
    const best = bestSellers(R, false).slice(0, 5);
    const lastBackup = state.settings.lastBackup;
    const needBackup = hasData() && !state.settings.sample && (!lastBackup || (Date.now() - lastBackup) > 7 * 864e5);
    const tone = f.net > 0 ? 'pos' : f.net < 0 ? 'neg' : '';

    main.innerHTML = `
      ${pageHead(state.settings.businessName + ' Dashboard', 'Is the business working? Your sales, costs and profit at a glance.', periodPicker())}
      ${!state.settings.welcomed && !hasData() ? `
        <div class="banner">
          <div><h2>Welcome! Let’s set up your tracker.</h2>
          <p>Explore with sample data first, or start clean and add your inventory items. Everything is saved in this browser.</p></div>
          <div class="head-right"><button class="btn" data-act="sample">Try with sample data</button><button class="btn primary" data-act="fresh">Start with my own data</button></div>
        </div>` : ''}
      ${state.settings.sample ? `<div class="banner"><div><h2>You’re viewing sample data</h2><p>Look around, then clear it when you’re ready to enter your real records.</p></div><button class="btn primary" data-act="clear-sample">Clear sample &amp; start fresh</button></div>` : ''}
      ${needBackup ? `<div class="banner warn"><div><h2>Time for a backup</h2><p>${lastBackup ? 'Your last backup was ' + fmtDate(isoDate(new Date(lastBackup))) + '.' : 'You haven’t backed up yet.'} Your data only lives in this browser.</p></div><button class="btn" data-act="backup">Download backup</button></div>` : ''}

      <div class="stats">
        ${stat('Booking sales', money(f.bookingSales), `${f.B.length} booking${f.B.length === 1 ? '' : 's'}`)}
        ${stat('Pop-up sales', money(f.popupSales), `${f.P.length} market day${f.P.length === 1 ? '' : 's'}`)}
        ${stat('Total revenue', money(f.revenue), PERIODS[state.settings.period])}
        ${stat('Total expenses', money(f.expenses), 'Supplies, staff, transport & more')}
        ${stat('Net profit', money(f.net), f.revenue ? 'Revenue − all expenses' : 'No sales yet', 'hero ' + tone)}
        ${stat('Profit margin', pct(f.margin), 'Target: 40–60%', Number.isFinite(f.margin) ? (f.margin >= 0.4 ? 'pos' : f.margin < 0.2 ? 'neg' : '') : '')}
        ${stat('LEGO built', int(f.built) + ' <small style="font-size:14px">pcs</small>', `Bookings + pop-up LEGO Basic · ${int(f.pieces)} pop-up pieces`)}
        ${stat('Remaining inventory', int(sum(st, s => Math.max(0, s.remaining))) + ' <small style="font-size:14px">pcs</small>', low.length ? `<span class="neg-text"><b>${low.length} item${low.length === 1 ? '' : 's'} need reorder</b></span>` : `${st.length} items · ${money(sum(st, s => s.value))}`)}
      </div>

      <section class="card">
        <div class="card-head"><h2>Monthly sales, expenses &amp; profit</h2><span class="sub">Last 12 months · <a href="#monthly">Full statement</a></span></div>
        ${barChart(months.map(k => MON[+k.slice(5) - 1]), [
          { name: 'Sales', color: 'var(--c-sales)', values: mf.map(x => x.revenue) },
          { name: 'Expenses', color: 'var(--c-exp)', values: mf.map(x => x.expenses) },
          { name: 'Profit', color: v => v < 0 ? 'var(--c-loss)' : 'var(--c-profit)', legend: 'var(--c-profit)', values: mf.map(x => x.net) }
        ], { label: 'Monthly sales, expenses and profit' })}
      </section>

      <div class="grid-3">
        <section class="card">
          <div class="card-head"><h2>Where the money goes</h2><span class="sub">${PERIODS[state.settings.period]}</span></div>
          ${hbars(expenseBreakdown(f), { empty: 'No expenses recorded for this period.' })}
        </section>
        <section class="card">
          <div class="card-head"><h2>Best-selling accessories</h2><a class="sub" href="#bestsellers">See all</a></div>
          ${hbars(best.map(b => ({ label: b.name, value: b.qty, sub: esc(b.category) })), { fmt: v => int(v) + ' pcs', color: 'var(--c-pop)', empty: 'Log accessories in <a href="#usage">Stock Out</a> to see what sells.' })}
        </section>
        <section class="card">
          <div class="card-head"><h2>Low stock alerts</h2><a class="sub" href="#items">Inventory</a></div>
          ${low.length ? `<ul class="list">${low.slice(0, 7).map(s => `<li><div class="grow"><b>${esc(s.item.name)}</b><span class="meta">Reorder at ${int(s.reorder)}</span></div><span class="pill bad">${int(s.remaining)} left</span></li>`).join('')}</ul>${low.length > 7 ? `<p class="muted" style="margin:8px 0 0">+${low.length - 7} more</p>` : ''}`
            : `<p class="empty">${st.length ? 'Everything is above its reorder level.' : 'Add items in <a href="#items">Inventory</a> to get alerts.'}</p>`}
        </section>
      </div>
      <div class="grid-2" style="margin-top:18px">
        <section class="card">
          <div class="card-head"><h2>Upcoming bookings</h2><a class="sub" href="#calendar">Calendar</a></div>
          ${upcoming.length ? `<ul class="list">${upcoming.map(b => `<li><div class="grow"><b>${esc(b.event || b.client)}</b><span class="meta">${fmtDate(b.date)} · ${int(b.qty)} pcs · ${esc(b.client)}</span></div><span class="pill ${b.stage === 'Inquiry' ? '' : 'info'}">${esc(b.stage || 'Confirmed')}</span></li>`).join('')}</ul>`
            : '<p class="empty">No upcoming bookings.</p>'}
        </section>
        <section class="card">
          <div class="card-head"><h2>Balances to collect</h2><span class="sub">${money(sum(owed, bookingOutstanding))} total</span></div>
          ${owed.length ? `<ul class="list">${owed.slice(0, 6).map(b => `<li><div class="grow"><b>${esc(b.client)}</b><span class="meta">${esc(b.event || '')} · ${fmtDate(b.date)}</span></div><button class="link-btn" data-edit="bookings:${b.id}">${money(bookingOutstanding(b))}</button></li>`).join('')}</ul>`
            : '<p class="empty">All bookings are fully paid. 🎉</p>'}
        </section>
      </div>`;
  }

  /* =========================================================
     Business health (KPIs)
     ========================================================= */
  function renderHealth(main) {
    const R = periodRange(state.settings.period);
    const f = finance(R);
    const now = new Date(); const cur = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    const last6 = Array.from({ length: 6 }, (_, i) => addMonths(cur, i - 5)).map(k => ({ k, v: finance(monthRange(k)).revenue }));
    const prev = last6[4].v, prev2 = last6[3].v;
    const bc = buildCost(), price = num(state.settings.buildPrice);
    const evs = eventsSummary(R).filter(e => e.revenue > 0).sort((a, b) => a.date.localeCompare(b.date));
    const avgEvent = evs.length ? sum(evs, e => e.revenue) / evs.length : 0;
    const lastEv = evs[evs.length - 1];
    const priorAvg = evs.length > 1 ? sum(evs.slice(0, -1), e => e.revenue) / (evs.length - 1) : 0;
    const cust = customers(); const repeat = cust.filter(c => c.count >= 2).length;
    const st = [...CTX.stats.values()]; const low = st.filter(s => s.low);
    const slowCut = shiftDate(todayISO(), -60);
    const slow = st.filter(s => s.remaining > 0 && (!s.lastUsed || s.lastUsed < slowCut));
    const unitMargin = price - bc;
    const fixedAvg = evs.length ? sum(evs, e => e.employee + e.transport + e.other) / evs.length : 0;
    const beUnits = unitMargin > 0 ? Math.ceil(fixedAvg / unitMargin) : Infinity;
    const losing = evs.filter(e => e.net < 0);
    const outstanding = sum(state.bookings, bookingOutstanding);
    const ratio = (a, b) => b ? a / b : NaN;
    const has = f.revenue > 0;

    const K = [];
    const add = (title, value, target, status, advice, extra = '') => K.push({ title, value, target, status, advice, extra });
    const band = (v, goodFn, warnFn) => !Number.isFinite(v) ? 'none' : goodFn(v) ? 'good' : warnFn(v) ? 'warn' : 'bad';

    const maxV = Math.max(1, ...last6.map(x => x.v));
    add('Gross sales trend', money(last6[5].v) + ' <small style="font-size:14px" class="muted">this month</small>', 'Increasing month to month',
      prev || prev2 ? (prev >= prev2 ? 'good' : prev >= prev2 * 0.85 ? 'warn' : 'bad') : 'none',
      prev || prev2 ? `${MON[+last6[4].k.slice(5) - 1]}: ${money(prev)} vs ${MON[+last6[3].k.slice(5) - 1]}: ${money(prev2)} (${prev2 ? (prev >= prev2 ? '+' : '') + pct((prev - prev2) / prev2) : 'new'}).` : 'Needs at least two months of sales.',
      `<div class="spark" title="Last 6 months">${last6.map(x => `<span style="height:${Math.max(4, x.v / maxV * 100)}%" title="${ymLabel(x.k)}: ${money(x.v)}"></span>`).join('')}</div>`);
    add('Net profit margin', pct(f.margin), '40–60% to start', band(f.margin, v => v >= 0.4, v => v >= 0.2),
      !has ? 'No sales in this period yet.' : f.margin >= 0.4 ? 'Healthy — you keep a good share of every peso.' : 'Costs eat too much of each sale. Check supply cost, staff hours and low-earning events.');
    add('Cost per LEGO build', money(bc) + ` <small style="font-size:14px" class="muted">of ${money(price)}</small>`, 'Under 45% of selling price', band(ratio(bc, price), v => v <= 0.45, v => v <= 0.55),
      price ? `Parts cost ${pct(ratio(bc, price))} of the price. ${bc / price > 0.45 ? `To hit 45%, price at least ${money(Math.ceil(bc / 0.45 / 5) * 5)} or cut part costs.` : 'Good pricing buffer.'} <a href="#buildcost">Adjust</a>` : 'Set your price in Cost per Build.');
    add('Employee cost', pct(ratio(f.employee, f.revenue)), 'Below 20% of sales', has ? band(ratio(f.employee, f.revenue), v => v < 0.2, v => v < 0.25) : 'none',
      has ? `${money(f.employee)} paid to staff this period.` : 'No sales in this period yet.');
    add('Transportation cost', pct(ratio(f.transport, f.revenue)), 'Below 10% of sales', has ? band(ratio(f.transport, f.revenue), v => v < 0.1, v => v < 0.15) : 'none',
      has ? `${money(f.transport)} on gas, fares and parking.` : 'No sales in this period yet.');
    const sc = ratio(f.supplies, f.revenue);
    add('Supply cost', pct(sc), '25–35% of sales', has ? (sc >= 0.25 && sc <= 0.35 ? 'good' : (sc < 0.25 || sc <= 0.45) ? 'warn' : 'bad') : 'none',
      !has ? 'No sales in this period yet.' : sc < 0.25 ? 'Low this period — likely using stock bought earlier. Watch inventory levels.' : sc > 0.35 ? 'High — bulk-buy fast movers, compare suppliers, or adjust prices.' : 'Right in the healthy range.');
    add('Average revenue per event', money(Math.round(avgEvent)), 'Increasing each event', !evs.length ? 'none' : evs.length < 2 ? 'info' : lastEv.revenue >= priorAvg ? 'good' : 'warn',
      evs.length ? `${evs.length} event${evs.length === 1 ? '' : 's'} this period. Latest: ${esc(lastEv.name)} — ${money(lastEv.revenue)}${evs.length > 1 ? ` vs ${money(Math.round(priorAvg))} average before it` : ''}. <a href="#events">Compare events</a>` : 'No events with sales in this period.');
    add('Repeat clients', pct(ratio(repeat, cust.length)), '30% or more', cust.length ? band(ratio(repeat, cust.length), v => v >= 0.3, v => v >= 0.15) : 'none',
      cust.length ? `${repeat} of ${cust.length} clients booked more than once (all time). <a href="#customers">Customers</a>` : 'No booking clients yet.');
    add('Break-even per event', Number.isFinite(beUnits) ? `${int(beUnits)} <small style="font-size:14px" class="muted">keepsakes</small>` : '—', 'Reach it before halfway through the event',
      !evs.length ? 'none' : losing.length ? (losing.length / evs.length > 0.25 ? 'bad' : 'warn') : 'good',
      unitMargin <= 0 ? 'Your price doesn’t cover part costs — every sale loses money.' : evs.length ? `Average event costs ${money(Math.round(fixedAvg))} (staff, transport, booth, food). At ${money(unitMargin)} profit per build you need ${int(beUnits)} sales to cover them. ${losing.length ? `<b class="neg-text">${losing.length} event${losing.length === 1 ? '' : 's'} lost money.</b>` : 'No event lost money.'}` : 'Record events to calculate.');
    add('Inventory health', `${low.length} <small style="font-size:14px" class="muted">to reorder</small>`, 'Fast-moving stock, minimal excess', !st.length ? 'none' : low.length === 0 && slow.length <= st.length * 0.25 ? 'good' : low.length > 3 ? 'bad' : 'warn',
      st.length ? `${low.length ? 'Reorder: ' + low.slice(0, 4).map(s => esc(s.item.name)).join(', ') + (low.length > 4 ? '…' : '') + '. ' : ''}${slow.length ? `${slow.length} item${slow.length === 1 ? '' : 's'} unused for 60+ days (${money(sum(slow, s => s.value))} tied up).` : 'No slow movers.'}` : 'Add inventory items to track.');
    add('Balances to collect', money(outstanding), 'Collect before or on event day', outstanding > 0 ? 'warn' : 'good',
      outstanding > 0 ? `${state.bookings.filter(b => bookingOutstanding(b) > 0).length} booking(s) still have a balance.` : 'Nothing outstanding.');

    const LBL = { good: 'On track', warn: 'Watch', bad: 'Action needed', info: 'Info', none: 'No data yet' };
    const scored = K.filter(k => ['good', 'warn', 'bad'].includes(k.status));
    const goodN = scored.filter(k => k.status === 'good').length;

    main.innerHTML = `
      ${pageHead('Business Health Check', 'Your key numbers compared with the starting benchmarks. These are targets to test against your real prices and costs — not fixed rules.', periodPicker())}
      <section class="card">
        <div class="score">
          <div class="big">${goodN}<span class="muted" style="font-size:22px"> / ${scored.length}</span></div>
          <div><b>indicators on track</b><div class="muted">${PERIODS[state.settings.period]} · ${scored.filter(k => k.status === 'bad').length} need action · ${scored.filter(k => k.status === 'warn').length} to watch</div></div>
        </div>
      </section>
      <div class="kpis">${K.map(k => `
        <article class="kpi ${k.status === 'none' ? '' : k.status}">
          <div class="kpi-top"><h3>${esc(k.title)}</h3><span class="pill ${k.status === 'none' ? '' : k.status}">${LBL[k.status]}</span></div>
          <div class="kpi-value">${k.value}</div>
          ${k.extra}
          <div class="target">Target: ${esc(k.target)}</div>
          <p>${k.advice}</p>
        </article>`).join('')}
      </div>`;
  }

  /* =========================================================
     Calendar
     ========================================================= */
  function renderCalendar(main) {
    if (!calMonth) calMonth = ymKey(todayISO());
    const [y, m] = calMonth.split('-').map(Number);
    const startDow = new Date(y, m - 1, 1).getDay(); const days = new Date(y, m, 0).getDate();
    const byDate = {};
    state.bookings.forEach(b => { if (ymKey(b.date) === calMonth) (byDate[b.date] = byDate[b.date] || []).push(`<button class="chip stage-${(b.stage || 'Confirmed').toLowerCase()}" data-edit="bookings:${b.id}" title="${esc(`${b.event || b.client} · ${b.qty || 0} pcs · ${b.stage || 'Confirmed'}`)}">${esc(b.client)}${b.qty ? ' · ' + int(b.qty) : ''}</button>`); });
    state.popups.forEach(p => { if (ymKey(p.date) === calMonth) (byDate[p.date] = byDate[p.date] || []).push(`<button class="chip popup" data-edit="popups:${p.id}" title="${esc(p.event + ' · ' + money(p.sales))}">${esc(p.event)}</button>`); });
    const today = todayISO();
    let cells = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < startDow; i++) cells += '<div class="day blank"></div>';
    for (let d = 1; d <= days; d++) {
      const iso = `${calMonth}-${pad2(d)}`;
      cells += `<div class="day${iso === today ? ' today' : ''}"><span class="dnum">${d}</span>${(byDate[iso] || []).join('')}</div>`;
    }
    const trailing = (7 - (startDow + days) % 7) % 7; for (let i = 0; i < trailing; i++) cells += '<div class="day blank"></div>';
    const monthB = state.bookings.filter(b => ymKey(b.date) === calMonth && b.stage !== 'Cancelled');
    const upcoming = state.bookings.filter(b => b.date >= today && b.stage !== 'Cancelled' && b.stage !== 'Completed').sort((a, b) => a.date.localeCompare(b.date));

    main.innerHTML = `
      ${pageHead('Booking Calendar', 'Confirmed, pending and completed events in one view. Click an entry to edit it.', '<a class="btn primary sm" href="#bookings">+ New booking</a>')}
      <section class="card">
        <div class="cal-head">
          <h2>${MONTHS[m - 1]} ${y}</h2>
          <button class="btn sm" data-cal="-1" aria-label="Previous month">‹ Prev</button>
          <button class="btn sm" data-cal="0">Today</button>
          <button class="btn sm" data-cal="1" aria-label="Next month">Next ›</button>
        </div>
        <div class="cal">${cells}</div>
        <div class="legend" style="margin-top:12px">
          <span><i style="background:var(--muted-bg)"></i>Inquiry</span><span><i style="background:var(--info-bg)"></i>Confirmed</span>
          <span><i style="background:var(--good-bg)"></i>Completed</span><span><i style="background:var(--yellow-soft)"></i>Pop-up market</span>
          <span class="muted">· ${monthB.length} booking${monthB.length === 1 ? '' : 's'} · ${int(sum(monthB, b => b.qty))} pcs to build this month</span>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Upcoming bookings</h2><span class="sub">${upcoming.length} scheduled</span></div>
        ${upcoming.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Client</th><th>Event</th><th class="num">Qty</th><th class="num">Balance due</th><th>Status</th></tr></thead><tbody>
          ${upcoming.map(b => `<tr class="clickable" data-edit="bookings:${b.id}"><td>${fmtDate(b.date)}</td><td>${esc(b.client)}<small>${esc(b.contact || '')}</small></td><td>${esc(b.event || '')}</td><td class="num">${int(b.qty)}</td><td class="num">${money(bookingOutstanding(b))}</td><td><span class="pill ${b.stage === 'Inquiry' ? '' : 'info'}">${esc(b.stage || 'Confirmed')}</span></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">No upcoming bookings.</p>'}
      </section>`;
  }

  /* =========================================================
     Event profit analysis
     ========================================================= */
  function renderEvents(main) {
    const R = periodRange(state.settings.period);
    const list = eventsSummary(R).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!list.find(e => e.key === selectedEvent)) selectedEvent = list[0] && list[0].key;
    const e = list.find(x => x.key === selectedEvent);
    const withRev = list.filter(x => x.revenue > 0);
    const best = withRev.slice().sort((a, b) => b.net - a.net)[0];
    const unlinked = unlinkedCosts(R);
    const bc = buildCost(), unitMargin = num(state.settings.buildPrice) - bc;

    const statement = e => {
      const lines = [];
      lines.push(['Revenue', money(e.revenue), 'strong']);
      if (e.bookingRev && e.popupRev) { lines.push(['Bookings', money(e.bookingRev), 'indent']); lines.push(['Pop-up sales', money(e.popupRev), 'indent']); }
      const cost = (l, v, note = '') => { if (v) lines.push([l + note, signed(-v), 'indent']); };
      cost('Transportation', e.transport);
      cost('Employees', e.employee);
      Object.entries(e.cats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => cost(k, v));
      cost('Supplies used', e.supplies, e.suppliesEst ? ' <span class="tag" title="No Stock Out entries for this event — estimated from Cost per Build × keepsakes">est.</span>' : '');
      lines.push(['Total expenses', money(e.costs), 'strong']);
      lines.push(['Net profit', signed(e.net), 'total']);
      lines.push(['Profit margin', pct(e.margin), '']);
      return `<table class="statement">${lines.map(([l, v, c]) => `<tr class="${c}"><td>${l}</td><td>${v}</td></tr>`).join('')}</table>`;
    };

    main.innerHTML = `
      ${pageHead('Event Profit Analysis', 'Each booking and pop-up after <b>all</b> its direct costs — transport, staff, food, booth, and supplies used. Costs are matched to events by the event name.', periodPicker())}
      <div class="stats">
        ${stat('Events', int(withRev.length), PERIODS[state.settings.period])}
        ${stat('Avg revenue / event', money(Math.round(withRev.length ? sum(withRev, x => x.revenue) / withRev.length : 0)))}
        ${stat('Avg profit / event', money(Math.round(withRev.length ? sum(withRev, x => x.net) / withRev.length : 0)))}
        ${stat('Best event', best ? esc(best.name) : '—', best ? `${money(best.net)} profit · ${pct(best.margin)}` : '')}
      </div>
      ${list.length ? `
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>${e ? esc(e.name) : ''}</h2><span class="sub">${e ? `${esc(e.type)} · ${fmtDate(e.date)}` : ''}</span></div>
          ${e ? statement(e) : ''}
          ${e && e.units && unitMargin > 0 ? `<p class="muted" style="margin:12px 0 0;font-size:13.5px">Break-even for this event: <b>${int(Math.ceil((e.employee + e.transport + e.other) / unitMargin))}</b> keepsakes (event costs ÷ ${money(unitMargin)} profit per build). Sold: <b>${int(e.units)}</b>.</p>` : ''}
        </section>
        <section class="card">
          <div class="card-head"><h2>Net profit by event</h2><span class="sub">Top 8</span></div>
          ${hbars(list.slice().sort((a, b) => b.net - a.net).slice(0, 8).map(x => ({ label: x.name, value: Math.max(0, x.net), sub: x.net < 0 ? `<span class="neg-text">Loss ${money(x.net)}</span>` : `${pct(x.margin)} margin`, color: 'var(--c-profit)' })), { fmt: v => money(v) })}
        </section>
      </div>
      <section class="card" style="margin-top:18px">
        <div class="card-head"><h2>All events</h2><span class="sub">Click a row to see its breakdown</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Event</th><th>Type</th><th>Date</th><th class="num">Revenue</th><th class="num">Supplies</th><th class="num">Employees</th><th class="num">Transport</th><th class="num">Other</th><th class="num">Net Profit</th><th class="num">Margin</th></tr></thead>
          <tbody>${list.map(x => `<tr class="clickable${x.key === selectedEvent ? ' selected' : ''}" data-event="${esc(x.key)}">
            <td><b>${esc(x.name)}</b></td><td>${esc(x.type)}</td><td>${fmtDate(x.date)}</td>
            <td class="num">${money(x.revenue)}</td><td class="num">${money(x.supplies)}${x.suppliesEst ? '<span class="tag">est.</span>' : ''}</td><td class="num">${money(x.employee)}</td><td class="num">${money(x.transport)}</td><td class="num">${money(x.other)}</td>
            <td class="num"><b>${signed(x.net)}</b></td><td class="num">${pct(x.margin)}</td></tr>`).join('')}</tbody>
        </table></div>
        ${unlinked ? `<p class="muted" style="margin:12px 0 0;font-size:13.5px">${money(unlinked)} of payroll, transport and expenses in this period isn’t linked to any event (general business costs). It’s still counted in the Dashboard and Monthly Statement.</p>` : ''}
      </section>` : `<section class="card"><p class="empty">No events in this period. Record a booking or pop-up and link costs to it by event name.</p></section>`}`;
  }

  /* =========================================================
     Best sellers
     ========================================================= */
  function renderBestSellers(main) {
    const R = periodRange(state.settings.period);
    const list = bestSellers(R, showAllParts);
    const totalQty = sum(list, r => r.qty);
    const P = state.popups.filter(p => inRange(p.date, R));
    const cats = POPUP_CATS.map(([k, l]) => ({ label: l, value: sum(P, p => p[k]) })).filter(c => c.value > 0).sort((a, b) => b.value - a.value);
    main.innerHTML = `
      ${pageHead('Best-selling Accessories', 'Automatically ranked by quantity sold, from Stock Out entries marked <b>Booking</b> or <b>Pop-up sale</b>. Use it to decide what to restock and feature.', periodPicker())}
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Top 10 by quantity</h2>
            <label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)"><input type="checkbox" id="allParts" style="width:auto"${showAllParts ? ' checked' : ''}> Include base parts</label></div>
          ${hbars(list.slice(0, 10).map(r => ({ label: r.name, value: r.qty, sub: esc(r.category) })), { fmt: v => int(v) + ' pcs', color: 'var(--c-pop)', empty: 'No accessory sales logged yet. Record items in <a href="#usage">Stock Out</a>.' })}
        </section>
        <section class="card">
          <div class="card-head"><h2>Pop-up sales by category</h2><span class="sub">${int(sum(cats, c => c.value))} pieces</span></div>
          ${hbars(cats, { fmt: v => int(v) + ' pcs', empty: 'No pop-up sales in this period.' })}
        </section>
      </div>
      <section class="card" style="margin-top:18px">
        <div class="card-head"><h2>Ranking</h2><span class="sub">Revenue uses each item’s add-on price from Inventory</span></div>
        ${list.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Accessory</th><th>Category</th><th class="num">Quantity Sold</th><th class="num">Share</th><th class="num">Revenue</th></tr></thead><tbody>
          ${list.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.category || '—')}</td><td class="num">${int(r.qty)}</td><td class="num">${pct(r.qty / totalQty)}</td><td class="num">${r.price ? money(r.revenue) : '<span class="muted">—</span>'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">Nothing to rank yet.</p>'}
      </section>`;
    $('#allParts').addEventListener('change', e => { showAllParts = e.target.checked; render(); });
  }

  /* =========================================================
     Monthly financial statement
     ========================================================= */
  function renderMonthly(main) {
    const thisYear = new Date().getFullYear();
    const years = uniq([thisYear, ...TABLE_KEYS.flatMap(k => state[k].map(r => (r.date || '').slice(0, 4)))].map(String)).filter(y => /^\d{4}$/.test(y)).sort().reverse();
    if (!monthlyYear) monthlyYear = String(thisYear);
    const keys = MONTHS.map((_, i) => `${monthlyYear}-${pad2(i + 1)}`);
    const rows = keys.map(k => ({ k, ...finance(monthRange(k)) }));
    const T = finance({ from: monthlyYear + '-01-01', to: monthlyYear + '-12-31' });
    const curKey = ymKey(todayISO());
    const cell = (v, k) => `<td class="num">${v ? signed(v) : `<span class="muted">${k > curKey ? '' : '—'}</span>`}</td>`;
    main.innerHTML = `
      ${pageHead('Monthly Financial Statement', 'Is the business improving month by month? Expenses are counted when paid (supplies when purchased).',
        `<select id="yearSel" aria-label="Year" style="width:auto">${years.map(y => `<option${y === monthlyYear ? ' selected' : ''}>${y}</option>`).join('')}</select><button class="btn sm no-print" data-act="print">Print</button>`)}
      <div class="stats">
        ${stat(monthlyYear + ' sales', money(T.revenue))}
        ${stat(monthlyYear + ' expenses', money(T.expenses))}
        ${stat(monthlyYear + ' net profit', money(T.net), '', 'hero ' + (T.net >= 0 ? 'pos' : 'neg'))}
        ${stat('Profit margin', pct(T.margin), 'Target: 40–60%')}
      </div>
      <section class="card">
        ${barChart(MON, [
          { name: 'Sales', color: 'var(--c-sales)', values: rows.map(r => r.revenue) },
          { name: 'Expenses', color: 'var(--c-exp)', values: rows.map(r => r.expenses) },
          { name: 'Profit', color: v => v < 0 ? 'var(--c-loss)' : 'var(--c-profit)', legend: 'var(--c-profit)', values: rows.map(r => r.net) }
        ], { label: 'Monthly sales, expenses and profit for ' + monthlyYear })}
      </section>
      <section class="card">
        <div class="table-wrap"><table>
          <thead><tr><th>Month</th><th class="num">Booking Sales</th><th class="num">Pop-up Sales</th><th class="num">Total Sales</th><th class="num">Supplies</th><th class="num">Employees</th><th class="num">Transport</th><th class="num">Other Expenses</th><th class="num">Total Expenses</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr><td><b>${MONTHS[i]}</b></td>${cell(r.bookingSales, r.k)}${cell(r.popupSales, r.k)}${cell(r.revenue, r.k)}${cell(r.supplies, r.k)}${cell(r.employee, r.k)}${cell(r.transport, r.k)}${cell(r.other, r.k)}${cell(r.expenses, r.k)}
            <td class="num"><b>${r.revenue || r.expenses ? signed(r.net) : ''}</b></td><td class="num">${r.revenue ? pct(r.margin) : ''}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total ${monthlyYear}</td><td class="num">${money(T.bookingSales)}</td><td class="num">${money(T.popupSales)}</td><td class="num">${money(T.revenue)}</td><td class="num">${money(T.supplies)}</td><td class="num">${money(T.employee)}</td><td class="num">${money(T.transport)}</td><td class="num">${money(T.other)}</td><td class="num">${money(T.expenses)}</td><td class="num">${signed(T.net)}</td><td class="num">${pct(T.margin)}</td></tr></tfoot>
        </table></div>
      </section>`;
    $('#yearSel').addEventListener('change', e => { monthlyYear = e.target.value; render(); });
  }

  /* =========================================================
     Customers
     ========================================================= */
  function renderCustomers(main) {
    const list = customers().sort((a, b) => b.spent - a.spent);
    const repeat = list.filter(c => c.count >= 2);
    const src = {}; state.bookings.filter(b => b.stage !== 'Cancelled' && b.source).forEach(b => { src[b.source] = (src[b.source] || 0) + 1; });
    main.innerHTML = `
      ${pageHead('Customers', 'Built automatically from your bookings — who books, how often, and how they found you.')}
      <div class="stats">
        ${stat('Clients', int(list.length))}
        ${stat('Repeat clients', pct(list.length ? repeat.length / list.length : NaN), `${repeat.length} booked 2+ times · target 30%`, list.length ? (repeat.length / list.length >= 0.3 ? 'pos' : '') : '')}
        ${stat('Avg spend / client', money(Math.round(list.length ? sum(list, c => c.spent) / list.length : 0)))}
        ${stat('Top client', list[0] ? esc(list[0].name) : '—', list[0] ? money(list[0].spent) : '')}
      </div>
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Client list</h2></div>
          ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th class="num">Bookings</th><th class="num">Total Spent</th><th class="num">Balance</th><th>Last Booking</th></tr></thead><tbody>
            ${list.map(c => `<tr><td><b>${esc(c.name)}</b>${c.count >= 2 ? ' <span class="pill good">Repeat</span>' : ''}<small>${esc([c.contact, [...c.occasions].join(', ')].filter(Boolean).join(' · '))}</small></td><td class="num">${c.count}</td><td class="num">${money(c.spent)}</td><td class="num">${c.outstanding ? `<span class="neg-text">${money(c.outstanding)}</span>` : '<span class="muted">—</span>'}</td><td>${fmtDate(c.last)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="empty">No clients yet. They appear here as you add <a href="#bookings">bookings</a>.</p>'}
        </section>
        <section class="card">
          <div class="card-head"><h2>How clients found you</h2><span class="sub">Referral sources</span></div>
          ${hbars(Object.entries(src).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), { fmt: v => int(v) + ' booking' + (v === 1 ? '' : 's'), empty: 'Fill in “How they found you” on bookings to see this.' })}
        </section>
      </div>`;
  }

  /* =========================================================
     Cost per build
     ========================================================= */
  function buildSummaryHtml() {
    const price = num(state.settings.buildPrice), cost = buildCost(), profit = price - cost, ratio = price ? cost / price : NaN;
    const status = !price ? '' : ratio <= 0.45 ? 'good' : ratio <= 0.55 ? 'warn' : 'bad';
    const minPrice = Math.ceil(cost / 0.45 / 5) * 5;
    const points = uniq([price - 20, price, price + 20, price + 50, minPrice, price + 100].filter(p => p > 0).map(String)).map(Number).sort((a, b) => a - b);
    return `
      <div class="stats">
        ${stat('Total cost per build', money(cost))}
        ${stat('Selling price', money(price))}
        ${stat('Profit before event costs', money(profit), price ? pct(profit / price) + ' of price' : '', profit >= 0 ? 'pos' : 'neg')}
        ${stat('Cost % of price', pct(ratio), `<span class="pill ${status}">${status === 'good' ? 'Under 45% — good' : status ? 'Above 45% target' : '—'}</span>`)}
      </div>
      ${status && status !== 'good' ? `<div class="callout warn" style="margin-bottom:16px">To bring parts under 45% of the price, sell at <b>${money(minPrice)}</b> or more — or lower part costs by <b>${money(Math.max(0, cost - price * 0.45))}</b> per build.</div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>If you charge</th><th class="num">Profit per build</th><th class="num">Cost %</th><th class="num">Profit on 100 pcs</th></tr></thead><tbody>
        ${points.map(p => `<tr class="${p === price ? 'selected' : ''}"><td><b>${money(p)}</b>${p === price ? ' <span class="pill info">current</span>' : ''}${p === minPrice && p !== price ? ' <span class="pill good">45% target</span>' : ''}</td><td class="num">${signed(p - cost)}</td><td class="num">${pct(cost / p)}</td><td class="num">${signed((p - cost) * 100)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function renderBuildCost(main) {
    main.innerHTML = `
      ${pageHead('Cost per LEGO Build', 'What one finished keepsake costs you in parts and packaging. This is used to check your pricing and to estimate supplies for events without Stock Out entries.')}
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Components</h2><button class="btn sm" data-act="comp-add">+ Add component</button></div>
          <div id="comps">${state.components.map(c => `
            <div class="comp-row">
              <input data-comp="${c.id}" data-f="name" value="${esc(c.name)}" aria-label="Component name">
              <span class="with-affix"><span class="affix">₱</span><input data-comp="${c.id}" data-f="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(c.cost)}" aria-label="Cost"></span>
              <button class="link-btn del" data-act="comp-del" data-id="${c.id}" aria-label="Remove ${esc(c.name)}">Remove</button>
            </div>`).join('')}</div>
          <div class="comp-row" style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
            <b>Selling price per keepsake</b>
            <span class="with-affix"><span class="affix">₱</span><input id="buildPrice" type="number" min="0" step="0.01" value="${esc(state.settings.buildPrice)}" aria-label="Selling price"></span>
            <span></span>
          </div>
          <p class="hint" style="margin:8px 0 0">The selling price is also the default price for new bookings.</p>
        </section>
        <section class="card"><div class="card-head"><h2>Result</h2></div><div id="bcSummary">${buildSummaryHtml()}</div></section>
      </div>`;
    $$('[data-comp]').forEach(inp => inp.addEventListener('input', e => {
      const c = state.components.find(x => x.id === e.target.dataset.comp); if (!c) return;
      c[e.target.dataset.f] = e.target.dataset.f === 'cost' ? (e.target.value === '' ? '' : num(e.target.value)) : e.target.value;
      save(); $('#bcSummary').innerHTML = buildSummaryHtml();
    }));
    $('#buildPrice').addEventListener('input', e => { state.settings.buildPrice = num(e.target.value); save(); $('#bcSummary').innerHTML = buildSummaryHtml(); });
  }

  /* =========================================================
     Data & settings
     ========================================================= */
  function renderData(main) {
    const counts = TABLE_KEYS.map(k => [k, state[k].length]);
    const lb = state.settings.lastBackup;
    main.innerHTML = `
      ${pageHead('Data & Backup', 'Your records are stored in <b>this browser on this computer</b>. Download a backup regularly — it’s the only copy if the browser data gets cleared, and it’s how you move to another computer.')}
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Backup &amp; restore</h2><span class="sub">${lb ? 'Last backup: ' + fmtDate(isoDate(new Date(lb))) : 'Never backed up'}</span></div>
          <p class="muted" style="margin-top:0">A backup is a single <code>.json</code> file with everything in the tracker.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn primary" data-act="backup">Download backup</button>
            <label class="btn" for="restoreFile">Restore from backup…</label>
            <input type="file" id="restoreFile" accept=".json,application/json" hidden>
          </div>
          <p class="hint" style="margin-top:10px">Restoring replaces everything currently in the tracker.</p>
        </section>
        <section class="card">
          <div class="card-head"><h2>Business details</h2></div>
          <div class="fgrid">
            <label class="field"><span class="lbl">Business name</span><input id="setName" value="${esc(state.settings.businessName)}"></label>
            <label class="field"><span class="lbl">Tagline</span><input id="setTag" value="${esc(state.settings.tagline)}"></label>
          </div>
        </section>
      </div>
      <section class="card" style="margin-top:18px">
        <div class="card-head"><h2>Export to spreadsheet (CSV)</h2><span class="sub">Opens in Excel or Google Sheets</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${counts.map(([k, n]) => `<button class="btn sm" data-act="csv" data-table="${k}">${esc(SCHEMAS[k].title)} <span class="muted">(${n})</span></button>`).join('')}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Sample data &amp; reset</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-act="sample">Load sample data</button>
          <button class="btn danger" data-act="wipe">Erase all data…</button>
        </div>
        <p class="hint" style="margin-top:10px">Loading sample data replaces your current records. Download a backup first if you have real data.</p>
      </section>`;
    $('#setName').addEventListener('input', e => { state.settings.businessName = e.target.value || 'memoraéBUILD'; save(); updateBrand(); });
    $('#setTag').addEventListener('input', e => { state.settings.tagline = e.target.value; save(); updateBrand(); });
    $('#restoreFile').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object' || !TABLE_KEYS.some(k => Array.isArray(data[k]))) throw new Error('bad');
          if (!confirm('Replace everything in the tracker with this backup?')) return;
          state = migrate(data); state.settings.welcomed = true; save(); toast('Backup restored'); render();
        } catch (err) { toast('That file isn’t a valid memoraéBUILD backup.', true); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }
  function doBackup() {
    state.settings.lastBackup = Date.now(); save();
    downloadFile(`memoraebuild-backup-${todayISO()}.json`, JSON.stringify(state, null, 1), 'application/json');
    toast('Backup downloaded');
  }

  /* =========================================================
     Guide
     ========================================================= */
  function renderGuide(main) {
    main.innerHTML = `
      ${pageHead('How to Use the Tracker', 'A simple routine that tells you whether memoraéBUILD is working — and where to improve.')}
      <section class="card prose">
        <h2>Daily / per event</h2>
        <ol>
          <li><b>Record every sale the day it happens</b> — customized orders in <a href="#bookings">Booking Sales</a>, market days in <a href="#popups">Pop-up Sales</a>.</li>
          <li><b>Log what you used</b> in <a href="#usage">Stock Out</a> (bodies, hair, hats, packaging…). This keeps <a href="#items">Inventory</a> accurate and powers <a href="#bestsellers">Best Sellers</a>.</li>
          <li><b>Record event costs separately</b>: <a href="#transport">Transportation</a>, <a href="#payroll">Employee Payroll</a>, and food, booth rental, electricity in <a href="#expenses">Operating Expenses</a>.</li>
          <li><b>Use the same event name everywhere</b> (e.g. “Carigara Fiesta”). The tracker suggests names as you type — that’s how each event’s true profit is calculated.</li>
        </ol>
        <h2>When restocking</h2>
        <ol start="5">
          <li>Enter each order in <a href="#purchases">Supply Purchases</a> with quantity and unit cost. Choose the matching Inventory item so stock goes up automatically.</li>
          <li>Red rows in Inventory and the Dashboard’s <b>Low stock alerts</b> tell you what to reorder.</li>
        </ol>
        <h2>Every month</h2>
        <ol start="7">
          <li>Open the <a href="#monthly">Monthly Statement</a> — compare sales, expenses and profit with last month.</li>
          <li>Check the <a href="#health">Business Health</a> page. Anything marked <span class="pill bad">Action needed</span> is where to focus.</li>
          <li>Review <a href="#events">Event Profit</a> to decide which events are worth joining again, and adjust prices in <a href="#buildcost">Cost per Build</a> if parts cost more than 45% of your price.</li>
          <li><b>Download a backup</b> from <a href="#data">Data &amp; Backup</a>.</li>
        </ol>
        <div class="callout"><b>Good to know:</b> Inquiry bookings don’t count as sales until you change them to Confirmed. Monthly figures count supplies when <i>purchased</i>; Event Profit counts supplies when <i>used</i>. If an event has no Stock Out entries, its supplies are estimated from your Cost per Build (marked <span class="tag">est.</span>).</div>
      </section>
      <section class="card prose">
        <h2>Starting benchmarks</h2>
        <div class="table-wrap"><table><thead><tr><th>KPI</th><th>Suggested target</th></tr></thead><tbody>
          <tr><td>Gross sales</td><td>Increasing month to month</td></tr>
          <tr><td>Net profit margin</td><td>40–60% as an initial benchmark</td></tr>
          <tr><td>Cost per LEGO</td><td>Under 45% of selling price</td></tr>
          <tr><td>Inventory turnover</td><td>Fast-moving stock, minimal excess</td></tr>
          <tr><td>Employee cost</td><td>Below 20% of sales</td></tr>
          <tr><td>Transportation cost</td><td>Below 10% of sales</td></tr>
          <tr><td>Supply cost</td><td>25–35% of sales</td></tr>
          <tr><td>Average revenue per event</td><td>Increasing each event</td></tr>
          <tr><td>Repeat clients</td><td>30% or more</td></tr>
          <tr><td>Break-even point</td><td>Reached before halfway through the event</td></tr>
        </tbody></table></div>
        <p class="muted">These are starting points, not universal rules — review them against your actual prices, labor needs and event costs.</p>
      </section>`;
  }

  /* =========================================================
     Sample data
     ========================================================= */
  function buildSample() {
    const s = defaultState();
    s.settings.welcomed = true; s.settings.sample = true; s.settings.period = 'quarter';
    let seed = 20261010;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = a => a[Math.floor(rnd() * a.length)];
    const ITEMS = [
      ['Male Body', 'Body', 200, 50, 15, ''], ['Female Body', 'Body', 150, 50, 15, ''],
      ['Legs – Black', 'Legs', 150, 40, 10, ''], ['Legs – Blue', 'Legs', 120, 40, 10, ''],
      ['Face Print', 'Head / Face', 250, 60, 8, ''], ['Hands (pair)', 'Hands', 300, 80, 4, ''],
      ['Black Hair', 'Hair', 100, 30, 12, 25], ['Brown Hair', 'Hair', 80, 30, 12, 25], ['Long Hair', 'Hair', 80, 25, 12, 25],
      ['Police Hat', 'Hats', 40, 20, 15, 35], ['Graduation Cap', 'Hats', 40, 15, 15, 35],
      ['Bouquet', 'Flowers', 60, 20, 15, 30], ['White Cat', 'Animals', 40, 15, 18, 40], ['Puppy', 'Animals', 40, 15, 18, 40],
      ['Guitar', 'Accessories', 40, 15, 15, 35], ['Camera', 'Accessories', 30, 10, 15, 35], ['Sword', 'Weapons', 30, 10, 10, 25],
      ['Gift Box', 'Packaging', 300, 80, 20, ''], ['Instruction Card', 'Printing', 300, 80, 5, ''], ['Sticker Label', 'Printing', 400, 100, 4, '']
    ];
    s.items = ITEMS.map(([name, category, beginning, reorder, unitCost, sellPrice]) => ({ id: uid(), name, category, beginning, reorder, unitCost, sellPrice, created: 0 }));
    s.suppliers = [
      { name: 'BrickParts PH', contact: 'shopee.ph/brickpartsph', platform: 'Shopee', leadTime: 7, notes: 'Bodies, legs, hair' },
      { name: 'MiniFig Hub', contact: 'lazada.com.ph/minifighub', platform: 'Lazada', leadTime: 10, notes: 'Accessories & animals' },
      { name: 'Tacloban Print Shop', contact: '0917 123 4567', platform: 'Local shop', leadTime: 2, notes: 'Cards & stickers' },
      { name: 'PackRight Supplies', contact: '0918 765 4321', platform: 'Local shop', leadTime: 3, notes: 'Gift boxes, bubble wrap' }
    ].map(x => ({ id: uid(), ...x }));
    const startDate = addMonths(ymKey(todayISO()), -5) + '-01';
    const byName = Object.fromEntries(s.items.map(i => [i.name, i]));
    const stock = Object.fromEntries(s.items.map(i => [i.name, i.beginning]));
    const supplierFor = it => it.category === 'Packaging' ? 'PackRight Supplies' : it.category === 'Printing' ? 'Tacloban Print Shop' : ['Animals', 'Accessories', 'Weapons', 'Flowers', 'Hats'].includes(it.category) ? 'MiniFig Hub' : 'BrickParts PH';
    const use = (date, event, name, qty, reason) => {
      if (qty <= 0) return;
      const it = byName[name];
      if (stock[name] < qty + it.reorder * 0.3) {
        const buy = Math.ceil((qty + it.reorder * 1.5) / 50) * 50;
        const pd = shiftDate(date, -ri(3, 8));
        s.purchases.push({ id: uid(), date: pd < startDate ? startDate : pd, supplier: supplierFor(it), item: name, qty: buy, unitCost: round2(it.unitCost * (0.9 + rnd() * 0.2)), notes: '' });
        stock[name] += buy;
      }
      stock[name] -= qty;
      s.usage.push({ id: uid(), date, event, item: name, qty, reason, notes: '' });
    };
    const split = (total, names) => { const out = {}; names.forEach(n => out[n] = 0); for (let i = 0; i < total; i++) out[pick(names)]++; return out; };

    const today = todayISO(); const cur = ymKey(today);
    const CLIENTS = [['Juan Dela Cruz', '0917 555 0101'], ['Maria Santos', '0918 555 0102'], ['Ana Reyes', 'fb.com/anareyes'], ['Carlo Mendoza', '0919 555 0104'], ['Bea Villanueva', '0920 555 0105'],
      ['Paolo Garcia', '0921 555 0106'], ['Kristine Lopez', 'fb.com/kristinel'], ['Joy Ramos', '0922 555 0108'], ['Leyte Teachers Assoc.', '053 555 0109'], ['Bayanihan Credit Coop', '053 555 0110']];
    const VENUES = ['Robinsons Tacloban Bazaar', 'Ormoc Night Market', 'Palo Weekend Market', 'Tacloban Astrodome Expo', 'Baybay City Fiesta'];
    const ACC_BY_OCC = { Wedding: ['Bouquet', 'Camera'], Birthday: ['Puppy', 'White Cat', 'Guitar'], Debut: ['Bouquet', 'Camera', 'White Cat'], Graduation: ['Graduation Cap'], Corporate: ['Camera', 'Police Hat'], Christening: ['Puppy'], Anniversary: ['Bouquet', 'Guitar'] };

    const logBooking = (b) => {
      const q = num(b.qty); const ev = b.event;
      const half = Math.round(q * (0.4 + rnd() * 0.2));
      use(b.date, ev, 'Male Body', half, 'Booking'); use(b.date, ev, 'Female Body', q - half, 'Booking');
      const lb = Math.round(q * 0.6); use(b.date, ev, 'Legs – Black', lb, 'Booking'); use(b.date, ev, 'Legs – Blue', q - lb, 'Booking');
      ['Face Print', 'Hands (pair)', 'Gift Box', 'Instruction Card', 'Sticker Label'].forEach(n => use(b.date, ev, n, q, 'Booking'));
      Object.entries(split(q, ['Black Hair', 'Black Hair', 'Brown Hair', 'Long Hair'])).forEach(([n, v]) => use(b.date, ev, n, v, 'Booking'));
      const acc = ACC_BY_OCC[b.occasion] || ['Camera', 'Guitar'];
      Object.entries(split(Math.round(q * (0.4 + rnd() * 0.3)), [...acc, 'Police Hat', 'Sword'])).forEach(([n, v]) => use(b.date, ev, n, v, 'Booking'));
      const staff = ri(1, 2);
      for (let i = 0; i < staff; i++) s.payroll.push({ id: uid(), date: b.date, event: ev, employee: ['Mark', 'Aira', 'Jun'][i], hours: ri(4, 8), rate: 80, fee: '' });
      s.transport.push({ id: uid(), date: b.date, event: ev, destination: b.client.split(' ')[0] + ' venue', gas: ri(3, 8) * 100, fare: pick(['', 100, 150]), parking: pick(['', '', 50]), other: '' });
      s.expenses.push({ id: uid(), date: b.date, category: 'Food', event: ev, description: 'Team meals', amount: ri(2, 5) * 100 });
    };
    const logPopup = (p) => {
      const ev = p.event;
      const q = num(p.legoBasic);
      const half = Math.round(q / 2);
      use(p.date, ev, 'Male Body', half, 'Pop-up sale'); use(p.date, ev, 'Female Body', q - half, 'Pop-up sale');
      use(p.date, ev, 'Legs – Black', q, 'Pop-up sale'); use(p.date, ev, 'Face Print', q, 'Pop-up sale'); use(p.date, ev, 'Hands (pair)', q, 'Pop-up sale'); use(p.date, ev, 'Gift Box', q, 'Pop-up sale');
      Object.entries(split(num(p.hair), ['Black Hair', 'Brown Hair', 'Long Hair'])).forEach(([n, v]) => use(p.date, ev, n, v, 'Pop-up sale'));
      Object.entries(split(num(p.hats), ['Police Hat', 'Police Hat', 'Graduation Cap'])).forEach(([n, v]) => use(p.date, ev, n, v, 'Pop-up sale'));
      Object.entries(split(num(p.animals), ['White Cat', 'Puppy'])).forEach(([n, v]) => use(p.date, ev, n, v, 'Pop-up sale'));
      use(p.date, ev, 'Bouquet', num(p.flowers), 'Pop-up sale'); use(p.date, ev, 'Sword', num(p.weapons), 'Pop-up sale');
      Object.entries(split(num(p.others), ['Guitar', 'Camera'])).forEach(([n, v]) => use(p.date, ev, n, v, 'Pop-up sale'));
      ['Mark', 'Aira'].forEach(n => s.payroll.push({ id: uid(), date: p.date, event: ev, employee: n, hours: ri(8, 12), rate: 80, fee: pick(['', '', 100]) }));
      s.transport.push({ id: uid(), date: p.date, event: ev, destination: p.location, gas: ri(4, 12) * 100, fare: pick(['', 150, 200]), parking: pick(['', 50, 100]), other: '' });
      s.expenses.push({ id: uid(), date: p.date, category: 'Booth Rental', event: ev, description: 'Booth fee', amount: ri(3, 6) * 500 });
      s.expenses.push({ id: uid(), date: p.date, category: 'Food', event: ev, description: 'Meals & water', amount: ri(4, 9) * 100 });
      if (rnd() < 0.6) s.expenses.push({ id: uid(), date: p.date, category: 'Electricity', event: ev, description: 'Booth power', amount: ri(2, 5) * 100 });
    };

    let firstBooking = true;
    for (let mi = -5; mi <= 0; mi++) {
      const k = addMonths(cur, mi); const [yy, mm] = k.split('-').map(Number);
      const lastDay = mi === 0 ? Math.max(1, Number(today.slice(8))) : new Date(yy, mm, 0).getDate();
      // monthly overhead
      [[5, 'Internet', 'Home fiber (business share)', 1299], [10, 'Marketing', 'Facebook ads', ri(5, 15) * 100]].forEach(([d, category, description, amount]) => {
        if (d <= lastDay) s.expenses.push({ id: uid(), date: `${k}-${pad2(d)}`, category, event: '', description, amount });
      });
      if (rnd() < 0.7 && lastDay >= 3) s.expenses.push({ id: uid(), date: `${k}-${pad2(ri(1, Math.min(lastDay, 25)))}`, category: pick(['Bubble Wrap', 'Plastic Bags', 'Receipt Paper', 'Printing']), event: '', description: 'Restock', amount: ri(2, 8) * 50 });
      // bookings
      const nB = mi === 0 ? 1 : ri(2, 3);
      for (let i = 0; i < nB; i++) {
        const d = `${k}-${pad2(ri(1, Math.min(28, lastDay)))}`;
        let b;
        if (firstBooking) {
          firstBooking = false;
          b = { date: d, client: 'Juan Dela Cruz', contact: '0917 555 0101', occasion: 'Wedding', pkg: '100 pax', qty: 100, price: 150, downpayment: 5000, payment: 'Fully Paid', stage: 'Completed', source: 'Facebook', notes: '' };
        } else {
          const [client, contact] = pick(CLIENTS); const occasion = pick(['Wedding', 'Birthday', 'Birthday', 'Debut', 'Corporate', 'Graduation', 'Christening', 'Anniversary']);
          const qty = ri(4, 24) * 5; const price = pick([150, 150, 180, 200, 250]);
          b = { date: d, client, contact, occasion, pkg: qty + ' pax', qty, price, downpayment: Math.round(qty * price * 0.3 / 100) * 100, payment: mi === 0 && rnd() < 0.5 ? 'Downpayment' : 'Fully Paid', stage: 'Completed', source: pick(SOURCES.slice(0, 6)), notes: '' };
        }
        b.event = `${b.client.split(' ')[0]} ${b.occasion} – ${MON[mm - 1]} ${+d.slice(8)}`;
        b.id = uid(); b.created = Date.now() - (6 - mi) * 1e6;
        s.bookings.push(b); logBooking(b);
      }
      // pop-ups on Saturdays
      const sats = []; for (let d = 1; d <= lastDay; d++) if (new Date(yy, mm - 1, d).getDay() === 6) sats.push(d);
      const nP = Math.min(sats.length, mi === 0 ? 1 : 2);
      for (let i = 0; i < nP; i++) {
        const d = sats[i * 2] || sats[i];
        const isFiesta = mi === -3 && i === 0;
        const venue = isFiesta ? 'Carigara Fiesta' : pick(VENUES);
        const p = { id: uid(), date: `${k}-${pad2(d)}`, event: isFiesta ? 'Carigara Fiesta' : `${venue} (${MON[mm - 1]})`, location: isFiesta ? 'Carigara, Leyte' : venue.replace(/ (Bazaar|Night Market|Weekend Market|Expo|City Fiesta)$/, ''),
          legoBasic: ri(30, 90), hats: ri(8, 35), hair: ri(10, 40), animals: ri(5, 30), flowers: ri(4, 25), weapons: ri(2, 15), others: ri(2, 12), notes: '' };
        p.sales = p.legoBasic * 150 + p.hats * 35 + p.hair * 25 + p.animals * 40 + p.flowers * 30 + p.weapons * 25 + p.others * 35;
        s.popups.push(p); logPopup(p);
        if (isFiesta) { // a second fiesta day
          const p2 = { ...p, id: uid(), date: shiftDate(p.date, 1), legoBasic: ri(40, 90), hats: ri(10, 35), hair: ri(10, 40) };
          p2.sales = p2.legoBasic * 150 + p2.hats * 35 + p2.hair * 25 + p2.animals * 40 + p2.flowers * 30 + p2.weapons * 25 + p2.others * 35;
          s.popups.push(p2); logPopup(p2);
        }
      }
    }
    // upcoming bookings
    [[6, 'Maria Santos', '0918 555 0102', 'Birthday', 40, 180, 'Downpayment', 'Confirmed', 'Repeat client'],
     [17, 'Leyte Teachers Assoc.', '053 555 0109', 'Corporate', 120, 150, 'Downpayment', 'Confirmed', 'Referral'],
     [29, 'Rico Abad', '0923 555 0111', 'Wedding', 80, 200, 'Unpaid', 'Inquiry', 'Instagram']].forEach(([off, client, contact, occasion, qty, price, payment, stage, source]) => {
      const date = shiftDate(today, off);
      s.bookings.push({ id: uid(), created: Date.now(), date, client, contact, occasion, event: `${client.split(' ')[0]} ${occasion} – ${MON[+date.slice(5, 7) - 1]} ${+date.slice(8)}`, pkg: qty + ' pax', qty, price,
        downpayment: payment === 'Downpayment' ? Math.round(qty * price * 0.3 / 100) * 100 : '', payment, stage, source, notes: '' });
    });
    TABLE_KEYS.forEach(k => s[k].forEach((r, i) => { if (!r.created) r.created = i; }));
    return s;
  }

  /* =========================================================
     Navigation & routing
     ========================================================= */
  const NAV = [
    ['Overview', 'var(--brand)', [['dashboard', 'Dashboard'], ['health', 'Business Health'], ['calendar', 'Booking Calendar']]],
    ['Sales', 'var(--c-sales)', [['bookings', 'Booking Sales'], ['popups', 'Pop-up Sales']]],
    ['Stock', 'var(--c-pop)', [['items', 'Inventory'], ['usage', 'Stock Out'], ['purchases', 'Supply Purchases'], ['suppliers', 'Suppliers']]],
    ['Costs', 'var(--c-exp)', [['expenses', 'Operating Expenses'], ['payroll', 'Employee Payroll'], ['transport', 'Transportation'], ['buildcost', 'Cost per Build']]],
    ['Reports', 'var(--c-profit)', [['events', 'Event Profit'], ['bestsellers', 'Best Sellers'], ['monthly', 'Monthly Statement'], ['customers', 'Customers']]],
    ['Settings', 'var(--faint)', [['data', 'Data & Backup'], ['guide', 'How to Use']]]
  ];
  const RENDERERS = {
    dashboard: renderDashboard, health: renderHealth, calendar: renderCalendar, events: renderEvents, bestsellers: renderBestSellers,
    monthly: renderMonthly, customers: renderCustomers, buildcost: renderBuildCost, data: renderData, guide: renderGuide
  };
  const currentPage = () => { const p = location.hash.slice(1); return (RENDERERS[p] || SCHEMAS[p]) ? p : 'dashboard'; };

  function updateBrand() {
    $('#brandName').textContent = state.settings.businessName || 'memoraéBUILD';
    $('#brandTag').textContent = state.settings.tagline || '';
    $('#topTitle').textContent = state.settings.businessName || 'memoraéBUILD';
  }
  function renderNav(page) {
    const lowN = [...CTX.stats.values()].filter(s => s.low).length;
    $('#nav').innerHTML = NAV.map(([group, color, items]) => `
      <div class="nav-group"><span class="nav-title">${group}</span>
        ${items.map(([k, l]) => `<a href="#${k}" class="${k === page ? 'on' : ''}" style="--dot:${color}"${k === page ? ' aria-current="page"' : ''}><i></i>${l}${k === 'items' && lowN ? `<span class="badge" title="${lowN} items need reorder">${lowN}</span>` : ''}</a>`).join('')}
      </div>`).join('');
  }
  function render() {
    const page = currentPage();
    CTX = { stats: itemStats() };
    renderNav(page); updateBrand();
    const label = (NAV.flatMap(g => g[2]).find(([k]) => k === page) || [])[1] || 'Dashboard';
    document.title = `${label} · ${state.settings.businessName || 'memoraéBUILD'} Tracker`;
    const main = $('#main');
    if (SCHEMAS[page]) renderTable(main, page); else RENDERERS[page](main);
  }

  /* =========================================================
     Global events
     ========================================================= */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act],[data-period],[data-edit],[data-sort],[data-event],[data-cal]');
    if (!t) { if (e.target.closest('#nav a')) document.body.classList.remove('nav-open'); return; }
    if (t.dataset.period) { state.settings.period = t.dataset.period; save(); render(); return; }
    if (t.dataset.edit) {
      const [table, id] = t.dataset.edit.split(':'); editing = { table, id };
      if (location.hash.slice(1) === table) render(); else location.hash = table;
      return;
    }
    if (t.dataset.sort && t.dataset.table) {
      const F = filters[t.dataset.table]; const k = t.dataset.sort;
      F.sort = F.sort && F.sort[0] === k ? [k, F.sort[1] === 'asc' ? 'desc' : 'asc'] : [k, 'asc'];
      drawList(t.dataset.table); return;
    }
    if (t.dataset.event) { selectedEvent = t.dataset.event; render(); return; }
    if (t.dataset.cal) { const d = +t.dataset.cal; calMonth = d === 0 ? ymKey(todayISO()) : addMonths(calMonth, d); render(); return; }
    const act = t.dataset.act, key = t.dataset.table;
    switch (act) {
      case 'edit': editing = { table: key, id: t.dataset.id }; render(); break;
      case 'cancel': editing = null; render(); break;
      case 'clear': break; // handled by form reset
      case 'del': {
        const S = SCHEMAS[key]; const rec = state[key].find(r => r.id === t.dataset.id); if (!rec) break;
        let msg = `Delete this ${S.singular.toLowerCase()}? This can’t be undone.`;
        if (key === 'items') { const n = state.usage.filter(u => norm(u.item) === norm(rec.name)).length + state.purchases.filter(p => norm(p.item) === norm(rec.name)).length; if (n) msg = `“${rec.name}” has ${n} purchase/stock-out entries. They’ll stay but won’t count toward any item. Delete anyway?`; }
        if (!confirm(msg)) break;
        state[key] = state[key].filter(r => r.id !== rec.id);
        if (editing && editing.id === rec.id) editing = null;
        save(); render(); toast('Deleted');
        break;
      }
      case 'csv': exportCSV(key, $('#list') && location.hash.slice(1) === key ? filteredRows(key) : null); break;
      case 'backup': doBackup(); render(); break;
      case 'print': window.print(); break;
      case 'sample':
        if (hasData() && !state.settings.sample && !confirm('Loading sample data will REPLACE all your current records. Continue?')) break;
        state = buildSample(); save(); editing = null; toast('Sample data loaded'); location.hash = 'dashboard'; render(); break;
      case 'fresh': state.settings.welcomed = true; save(); location.hash = 'items'; toast('Start by adding your inventory items'); break;
      case 'clear-sample':
        if (!confirm('Remove all sample data and start with an empty tracker?')) break;
        state = defaultState(); state.settings.welcomed = true; save(); location.hash = 'items'; render(); toast('Ready for your real data — start with Inventory'); break;
      case 'wipe':
        if (!confirm('Erase ALL records in the tracker? Download a backup first if you might need them.')) break;
        if (!confirm('Are you sure? This cannot be undone.')) break;
        state = defaultState(); state.settings.welcomed = true; save(); render(); toast('All data erased'); break;
      case 'comp-add': state.components.push({ id: uid(), name: 'New component', cost: 0 }); save(); render(); { const ins = $$('[data-f="name"]'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } } break;
      case 'comp-del': state.components = state.components.filter(c => c.id !== t.dataset.id); save(); render(); break;
    }
  });
  window.addEventListener('hashchange', () => {
    if (editing && editing.table !== location.hash.slice(1)) editing = null;
    document.body.classList.remove('nav-open');
    render(); window.scrollTo(0, 0);
  });
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
  window.addEventListener('storage', e => { if (e.key === STORE_KEY) { state = load(); render(); } });
  // Charts are drawn at the container's width; redraw them when the window width changes.
  let lastW = window.innerWidth, resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      if (['dashboard', 'monthly'].includes(currentPage())) render();
    }, 200);
  });

  render();
})();
