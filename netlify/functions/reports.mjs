import { getStore } from '@netlify/blobs';

function parseDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  const mo = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m) return `${m[3]}-${mo[m[2]]||'01'}-${m[1].padStart(2,'0')}`;
  const d = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (d) return `${d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`;
  return raw.slice(0,10);
}

function getWeekRange(weekEnd) {
  const d = new Date(weekEnd + 'T12:00:00');
  d.setDate(d.getDate() - 6);
  return { start: d.toISOString().slice(0,10), end: weekEnd };
}

function fmt(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)}-${months[parseInt(m)-1]}-${y.slice(2)}`;
}

const CSS = `
  body{font-family:Arial,sans-serif;font-size:9px;margin:0;color:#000;}
  .page{width:270mm;padding:8mm;page-break-after:always;box-sizing:border-box;}
  .page:last-child{page-break-after:auto;}
  .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:6px;}
  .header-left .title{font-size:14px;font-weight:bold;}
  .header-left .sub{font-size:10px;color:#444;margin-top:2px;}
  .header-right{text-align:right;font-size:10px;font-weight:bold;}
  .stats{display:flex;gap:10px;margin-bottom:8px;}
  .stat{border:1px solid #ddd;padding:4px 10px;border-radius:4px;text-align:center;}
  .stat-val{font-size:13px;font-weight:bold;color:#B8472B;}
  .stat-lbl{font-size:8px;color:#666;}
  .content{display:flex;gap:10px;}
  .summary{min-width:155px;max-width:155px;}
  .stbl{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;}
  .stbl th{background:#2B2620;color:#fff;padding:3px 5px;text-align:left;}
  .stbl td{padding:2px 5px;border-bottom:1px solid #eee;}
  .stbl .tot td{font-weight:bold;border-top:2px solid #000;background:#f0f0f0;}
  .grand{font-size:11px;font-weight:bold;padding:5px 6px;background:#EAF4EA;border:1px solid #A8CFA8;border-radius:3px;margin-top:4px;}
  .detail{flex:1;overflow:hidden;}
  .dtbl{width:100%;border-collapse:collapse;font-size:8px;}
  .dtbl th{background:#2B2620;color:#fff;padding:2px 4px;text-align:left;white-space:nowrap;}
  .dtbl td{padding:2px 4px;border-bottom:1px solid #eee;white-space:nowrap;overflow:hidden;max-width:90px;text-overflow:ellipsis;}
  .dtbl tr:nth-child(even){background:#f9f9f9;}
  .dtbl .chk{text-align:center;}
  .invoice-band{background:#F4DCC9;padding:5px 8px;border-radius:3px;margin-bottom:7px;font-size:9px;}
  @media print{body{margin:0;}@page{size:landscape;margin:5mm;}}
`;

export default async (req) => {
  const url = new URL(req.url);
  const weekEnd = url.searchParams.get('week_end');
  const type = url.searchParams.get('type') || 'driver';
  const code = url.searchParams.get('code') || 'all';

  if (!weekEnd) {
    return new Response(JSON.stringify({error:'week_end required (YYYY-MM-DD)'}), {status:400,headers:{'content-type':'application/json'}});
  }

  const store = getStore('flower-orders');
  const {blobs} = await store.list();
  const allOrders = (await Promise.all(blobs.map(b => store.get(b.key,{type:'json'})))).filter(Boolean);

  const {start, end} = getWeekRange(weekEnd);
  const weekOrders = allOrders.filter(o => {
    const d = parseDate(o.date || o.received_at || '');
    return d && d >= start && d <= end;
  });

  const ratesStore = getStore('flower-rates');
  let rates = {};
  try { rates = await ratesStore.get('rates',{type:'json'}) || {}; } catch(e) {}

  const weekLabel = fmt(weekEnd);
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reports ${weekLabel}</title><style>${CSS}</style></head><body>`;

  if (type === 'driver') {
    const drivers = {};
    weekOrders.forEach(o => {
      const dc = (o.driver || '').toUpperCase();
      if (!dc || dc === 'SCD') return;
      if (!drivers[dc]) drivers[dc] = {name: o.driver_name || dc, orders:[]};
      drivers[dc].orders.push(o);
    });

    const targets = code !== 'all' ? [code.toUpperCase()] : Object.keys(drivers).sort();

    targets.forEach(dc => {
      const drv = drivers[dc];
      if (!drv) return;
      const orders = drv.orders.sort((a,b) => (parseDate(a.date||a.received_at||'')||'').localeCompare(parseDate(b.date||b.received_at||'')||''));

      // Calculate pay components per order
      const orderPay = orders.map(o => {
        const zone = (o.zone_code||'').toUpperCase();
        const pieces = parseInt(o.total_pieces||1);
        const r = rates[zone] || {};
        const gdpi = parseFloat(r.gdpi) || 0;
        let drate, total;
        if (o.driver_pay) {
          total = parseFloat(o.driver_pay);
          drate = total - gdpi;
        } else {
          drate = (r.drate||0) + (pieces-1)*(r.dratex||0);
          total = drate + gdpi;
        }
        return {o, zone, pieces, drate, gdpi, total};
      });

      // Summary pivot
      const zoneDrate = {}, zoneGdpi = {};
      let sumDrate = 0, sumGdpi = 0;
      orderPay.forEach(({zone, drate, gdpi}) => {
        zoneDrate[zone] = (zoneDrate[zone]||0) + drate;
        zoneGdpi[zone] = (zoneGdpi[zone]||0) + gdpi;
        sumDrate += drate;
        sumGdpi += gdpi;
      });
      const totalDue = sumDrate + sumGdpi;
      const allZones = [...new Set([...Object.keys(zoneDrate)])].sort();

      html += `<div class="page">
        <div class="header">
          <div class="header-left">
            <div class="title">${drv.name} &mdash; Week Ending ${weekLabel}</div>
            <div class="sub">Driver ${dc} &bull; SMART CHOICE DELIVERY DRIVER DETAIL</div>
          </div>
          <div class="header-right">SMART CHOICE DELIVERY<br>Driver Weekly Detail</div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-val">${orders.length}</div><div class="stat-lbl">DELIVERIES</div></div>
          <div class="stat"><div class="stat-val">$${sumDrate.toFixed(2)}</div><div class="stat-lbl">BASE PAY</div></div>
          <div class="stat"><div class="stat-val">$${sumGdpi.toFixed(2)}</div><div class="stat-lbl">FUEL PREMIUM</div></div>
          <div class="stat"><div class="stat-val">$${totalDue.toFixed(2)}</div><div class="stat-lbl">TOTAL DUE</div></div>
        </div>
        <div class="content">
          <div class="summary">
            <table class="stbl">
              <thead><tr><th>DZONE</th><th>drate</th></tr></thead>
              <tbody>
                ${allZones.map(z=>`<tr><td>${z}</td><td>$${(zoneDrate[z]||0).toFixed(2)}</td></tr>`).join('')}
                <tr class="tot"><td>Grand Total</td><td>$${sumDrate.toFixed(2)}</td></tr>
              </tbody>
            </table>
            <table class="stbl">
              <thead><tr><th>DZONE</th><th>GDPI</th></tr></thead>
              <tbody>
                ${allZones.filter(z=>zoneGdpi[z]>0).map(z=>`<tr><td>${z}</td><td>$${(zoneGdpi[z]||0).toFixed(2)}</td></tr>`).join('')}
                <tr class="tot"><td>Total GDPI</td><td>$${sumGdpi.toFixed(2)}</td></tr>
              </tbody>
            </table>
            <div class="grand">Total $ Due: $${totalDue.toFixed(2)}</div>
          </div>
          <div class="detail">
            <table class="dtbl">
              <thead><tr><th>Date</th><th>Order ID</th><th>Name</th><th>Address</th><th>DSHOP</th><th>DZONE</th><th>Pcs</th><th>drate</th><th>GDPI</th><th>Total</th><th>&#9744;</th></tr></thead>
              <tbody>
                ${orderPay.map(({o,zone,pieces,drate,gdpi,total})=>`<tr>
                  <td>${fmt(parseDate(o.date||o.received_at||''))}</td>
                  <td>${o.order_id||1}</td>
                  <td>${(o.name||'').slice(0,18)}</td>
                  <td>${(o.formatted_address||o.address||'').slice(0,28)}</td>
                  <td>${o.shop_code||''}</td>
                  <td>${zone}</td>
                  <td>${pieces}</td>
                  <td>$${drate.toFixed(2)}</td>
                  <td>$${gdpi.toFixed(2)}</td>
                  <td>$${total.toFixed(2)}</td>
                  <td class="chk">&#9744;</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    });

  } else if (type === 'shop') {
    const shops = {};
    weekOrders.forEach(o => {
      const sc = (o.shop_code||'').toUpperCase();
      if (!sc || sc === 'SCD') return;
      if (!shops[sc]) shops[sc] = {name: o.shop_full||o.shop||sc, orders:[]};
      shops[sc].orders.push(o);
    });

    const targets = code !== 'all' ? [code.toUpperCase()] : Object.keys(shops).sort();

    targets.forEach(sc => {
      const shop = shops[sc];
      if (!shop) return;
      const orders = shop.orders.sort((a,b) => (parseDate(a.date||a.received_at||'')||'').localeCompare(parseDate(b.date||b.received_at||'')||''));

      const orderAmts = orders.map(o => {
        const zone = (o.zone_code||'').toUpperCase();
        const pieces = parseInt(o.total_pieces||1);
        const r = rates[zone] || {};
        const amount = (r.srate||0) + (pieces-1)*(r.sratex||0);
        return {o, zone, pieces, amount};
      });

      const zoneSums = {};
      let grandTotal = 0;
      orderAmts.forEach(({zone,amount}) => {
        zoneSums[zone] = (zoneSums[zone]||0) + amount;
        grandTotal += amount;
      });

      html += `<div class="page">
        <div class="header">
          <div class="header-left">
            <div class="title">${sc} ${shop.name} &mdash; Week Ending ${weekLabel}</div>
            <div class="sub">SMART CHOICE DELIVERY SHOP DETAIL &bull; INVOICE PERIOD ${weekEnd}</div>
          </div>
          <div class="header-right">SMART CHOICE DELIVERY<br>Shop Weekly Detail</div>
        </div>
        <div class="invoice-band">WEEK ENDING ${weekEnd} &nbsp;&bull;&nbsp; DSHOP ${sc} &nbsp;&bull;&nbsp; Invoice Total: $${grandTotal.toFixed(2)}</div>
        <div class="content">
          <div class="summary">
            <table class="stbl">
              <thead><tr><th>DZONE</th><th>Srate</th></tr></thead>
              <tbody>
                ${Object.keys(zoneSums).sort().map(z=>`<tr><td>${z}</td><td>$${zoneSums[z].toFixed(2)}</td></tr>`).join('')}
                <tr class="tot"><td>Grand Total</td><td>$${grandTotal.toFixed(2)}</td></tr>
              </tbody>
            </table>
            <div class="grand">Invoice Total: $${grandTotal.toFixed(2)}</div>
          </div>
          <div class="detail">
            <table class="dtbl">
              <thead><tr><th>Date</th><th>Order ID</th><th>Name</th><th>Address</th><th>Driver</th><th>DZONE</th><th>Pcs</th><th>Srate</th><th>&#9744;</th></tr></thead>
              <tbody>
                ${orderAmts.map(({o,zone,pieces,amount})=>`<tr>
                  <td>${fmt(parseDate(o.date||o.received_at||''))}</td>
                  <td>${o.order_id||1}</td>
                  <td>${(o.name||'').slice(0,20)}</td>
                  <td>${(o.formatted_address||o.address||'').slice(0,30)}</td>
                  <td>${o.driver||''}</td>
                  <td>${zone}</td>
                  <td>${pieces}</td>
                  <td>$${amount.toFixed(2)}</td>
                  <td class="chk">&#9744;</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    });
  }

  html += '</body></html>';
  return new Response(html, {status:200, headers:{'content-type':'text/html; charset=utf-8'}});
};

export const config = { path: '/api/reports' };
