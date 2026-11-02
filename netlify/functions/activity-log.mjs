<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0C769E">
<title>Smart Choice Delivery - Event Quote</title>
<style>
:root{--bg:#FAF7F2;--card:#fff;--ink:#2B2620;--ink-soft:#6B6256;--border:#E6DECF;--accent:#0C769E;--accent-soft:#D6EEF7;--warm:#B8472B;--green:#2C6B2C;--green-soft:#EAF4EA;--amber:#8A5A00;--amber-soft:#FBF0D6;--radius:10px;}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;}
.topbar{background:var(--card);border-bottom:3px solid var(--warm);padding:14px 20px;display:flex;gap:16px;align-items:center;}
.topbar h1{font-family:Georgia,serif;font-size:19px;margin:0;font-weight:600;flex:1;}.topbar a{color:var(--accent);text-decoration:none;font-size:13px;font-weight:600;}
.main{padding:16px;max-width:1180px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;}
@media(max-width:900px){.main{grid-template-columns:1fr;}}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:14px;}
h2{font-family:Georgia,serif;font-size:15px;margin:0 0 10px;}
label{display:block;font-size:11px;color:var(--ink-soft);margin:8px 0 3px;text-transform:uppercase;letter-spacing:.03em;}
input,select,textarea{width:100%;padding:8px 9px;border:1px solid var(--border);border-radius:8px;font:inherit;background:#fff;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
.btn{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;}
.btn.ghost{background:#fff;color:var(--accent);border:1px solid var(--accent);}.btn.sm{padding:4px 9px;font-size:12px;}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.lines{width:100%;border-collapse:collapse;font-size:13px;}.lines th{font-size:11px;color:var(--ink-soft);text-align:left;padding:4px;}.lines td{padding:3px;vertical-align:middle;}
.lines input{padding:6px 7px;}.n{text-align:right;}
.msg{border-radius:8px;padding:9px 12px;margin:10px 0;font-size:13px;}.ok{background:var(--green-soft);color:var(--green);}.err{background:#FBEAEA;color:#7A2E22;}
.hint{font-size:12px;color:var(--ink-soft);margin:6px 0 0;line-height:1.5;}
table.list{width:100%;border-collapse:collapse;font-size:13px;}table.list th{font-size:11px;color:var(--ink-soft);text-align:left;padding:5px;}table.list td{padding:6px 5px;border-top:1px solid var(--border);}
.tag{display:inline-block;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700;background:#eee;}
.s-sent{background:var(--accent-soft);color:var(--accent);}.s-accepted{background:var(--green-soft);color:var(--green);}.s-declined,.s-cancelled{background:#F4DCC9;color:var(--warm);}
/* the quote as the customer sees it */
.doc{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:26px 28px;font-family:Georgia,serif;color:#222;}
.doc h3{margin:0;font-size:22px;}.doc .sub{color:#666;font-size:12px;font-family:-apple-system,"Segoe UI",sans-serif;}
.doc .top{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid var(--warm);padding-bottom:10px;margin-bottom:12px;}
.doc .qno{text-align:right;font-family:-apple-system,"Segoe UI",sans-serif;font-size:12px;line-height:1.6;}.doc .qno b{font-size:15px;}
.doc .cols{display:flex;gap:24px;flex-wrap:wrap;font-family:-apple-system,"Segoe UI",sans-serif;font-size:13px;margin-bottom:12px;}.doc .cols div{flex:1;min-width:180px;}.doc .cols h4{margin:0 0 3px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;}
.doc table{width:100%;border-collapse:collapse;font-family:-apple-system,"Segoe UI",sans-serif;font-size:13px;}.doc th{text-align:left;border-bottom:1px solid #999;padding:6px 4px;font-size:11px;text-transform:uppercase;color:#555;}.doc td{padding:6px 4px;border-bottom:1px solid #eee;}.doc .r{text-align:right;}
.doc .tot td{border:0;padding:3px 4px;}.doc .tot .grand td{font-size:16px;font-weight:700;border-top:2px solid #333;padding-top:7px;}
.doc .small{font-family:-apple-system,"Segoe UI",sans-serif;font-size:12px;color:#444;white-space:pre-wrap;margin-top:12px;line-height:1.5;}
@media print{
  body{background:#fff;}.topbar,.noprint,.card{display:none !important;}
  .main{display:block;padding:0;max-width:none;}.docwrap{display:block !important;}.doc{border:0;padding:0;}
}
</style>
</head>
<body>
<div class="topbar"><h1>Event Quote</h1><a href="/hub.html">&larr; Hub</a></div>
<div class="main">
 <div class="noprint">
  <div class="card">
   <h2>Customer</h2>
   <div class="g2"><div><label>Shop or customer</label><input id="cName" list="shopList" autocomplete="off" placeholder="Start typing a shop, or type a name"></div><div><label>Code (shops)</label><input id="cCode" maxlength="10"></div></div>
   <div class="g3"><div><label>Contact</label><input id="cContact"></div><div><label>Email</label><input id="cEmail" type="email"></div><div><label>Phone</label><input id="cPhone"></div></div>
   <datalist id="shopList"></datalist>
  </div>
  <div class="card">
   <h2>Event</h2>
   <div class="g2"><div><label>Event name</label><input id="eName" placeholder="e.g. Smith wedding reception"></div><div><label>Type</label><select id="eType"><option>Special Event</option><option>Wedding</option><option>Funeral</option><option>Corporate</option><option>Other</option></select></div></div>
   <div class="g2"><div><label>Event date</label><input id="eDate" type="date"></div><div><label>Delivery time / window</label><input id="eTime" placeholder="e.g. 3:00 to 3:30 pm"></div></div>
   <label>Pick up from</label><input id="ePickup" placeholder="Shop or address">
   <label>Deliver to (venue)</label><input id="eVenue" placeholder="Venue name and address">
   <div class="g3"><div><label>Pieces</label><input id="ePieces" type="number" min="0" value="1"></div><div><label>Trips / drivers</label><input id="eTrips" type="number" min="1" value="1"></div><div><label>&nbsp;</label><button class="btn ghost" id="priceBtn" type="button" style="width:100%;">Price it</button></div></div>
   <div class="g2"><div><label>Driver pay per trip ($)</label><input id="eDpay" type="number" min="0" step="0.01" placeholder="e.g. 60.00"></div><div><label>Shop is billed per trip</label><input id="eEach" readonly></div></div>
   <p class="hint">Each delivery a driver enters with this quote number is paid the driver pay above, and the shop is charged the quote subtotal divided by the trips. Shop code (above) is needed so it lands on the right QuickBooks invoice.</p>
   <div class="g2"><div><label>Set-up people</label><input id="eSetP" type="number" min="0" value="0"></div><div><label>Set-up hours each</label><input id="eSetH" type="number" min="0" step="0.5" value="0"></div></div>
   <p class="hint">Price it fills the standard lines from your current rate table: the special-event rate plus extra pieces, set-up time, and one delivery per trip. Edit any rate or add your own lines below; the quoted price is whatever the lines say.</p>
  </div>
  <div class="card">
   <h2>Price lines</h2>
   <table class="lines"><thead><tr><th>Description</th><th style="width:60px">Qty</th><th style="width:90px">Rate</th><th class="n" style="width:80px">Amount</th><th style="width:30px"></th></tr></thead><tbody id="lines"></tbody></table>
   <div class="row" style="margin-top:8px;"><button class="btn ghost sm" id="addLine" type="button">+ Add line</button><button class="btn ghost sm" id="addHot" type="button">+ Hot shot</button><button class="btn ghost sm" id="addDisc" type="button">+ Discount</button>
    <label style="margin:0 0 0 auto;display:flex;gap:6px;align-items:center;text-transform:none;font-size:13px;color:var(--ink);"><input id="gst" type="checkbox" checked style="width:auto;"> Add GST (5%)</label></div>
   <div id="totalsLine" class="hint" style="font-size:14px;color:var(--ink);margin-top:8px;"></div>
  </div>
  <div class="card">
   <h2>Notes and terms</h2>
   <label>Notes to the customer</label><textarea id="notes" rows="3" placeholder="Anything specific about this event"></textarea>
   <label>Terms</label><textarea id="terms" rows="3"></textarea>
   <label>Valid until</label><input id="valid" type="date" style="max-width:200px;">
  </div>
  <div class="card">
   <div class="row"><button class="btn" id="saveBtn" type="button">Save quote</button><button class="btn ghost" id="printBtn" type="button">Print / save PDF</button><button class="btn ghost" id="copyBtn" type="button">Copy as text</button><button class="btn ghost" id="mailBtn" type="button">Email</button><button class="btn ghost" id="newBtn" type="button">New quote</button></div>
   <div id="msg"></div>
  </div>
  <div class="card">
   <h2>Saved quotes</h2>
   <div id="list">Loading&hellip;</div>
  </div>
 </div>
 <div class="docwrap"><div class="doc" id="doc"></div></div>
</div>
<script>
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function $(id){return document.getElementById(id);}
function money(n){return '$'+(Math.round((Number(n)||0)*100)/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});}
var gate=fetch('/api/auth?action=check').then(function(r){return r.json();}).then(function(d){ if(!d.authenticated) location.href='/login.html?redirect='+encodeURIComponent(location.pathname); return !!d.authenticated; }).catch(function(){ location.href='/login.html?redirect='+encodeURIComponent(location.pathname); return false; });
var DEFAULT_TERMS='Prices are in Canadian dollars. A change to the number of pieces, the delivery time, the venue or the set-up hours may change the price. Please confirm this quote before the event date.';
var RATES={}, SHOPS={}, curId='', curStatus='draft', lines=[], curLinked=0;
function today(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');}
function plusDays(n){var d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmtDate(s){ if(!s) return ''; var p=s.split('-'); var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return M[parseInt(p[1],10)-1]+' '+parseInt(p[2],10)+', '+p[0]; }

/* ---- rates: the shop-facing rate (srate) of SPEC, with sensible fallbacks */
function rate(code,field,fallback){ var r=RATES[code]; return (r&&typeof r[field]==='number'&&r[field]>0)?r[field]:fallback; }
function priceIt(){
  var pieces=Math.max(1,parseInt($('ePieces').value,10)||1), trips=Math.max(1,parseInt($('eTrips').value,10)||1);
  var base=rate('SPEC','srate',25), extra=rate('SPEC','sratex',5);
  var setP=parseInt($('eSetP').value,10)||0, setH=parseFloat($('eSetH').value)||0, setRate=rate('SET','srate',35);
  var keep=lines.filter(function(l){return !l.auto;});
  var auto=[{desc:$('eType').value+' delivery'+($('eVenue').value?' to '+$('eVenue').value.split(',')[0]:'')+' (first piece)',qty:trips,rate:base,auto:true}];
  var extraCount=(pieces-1);
  if(extraCount>0) auto.push({desc:'Additional pieces',qty:extraCount,rate:extra,auto:true});
  if(setP>0&&setH>0) auto.push({desc:'Event set-up, '+setP+' '+(setP===1?'person':'people')+' x '+setH+' hr',qty:setP*setH,rate:setRate,auto:true});
  lines=auto.concat(keep); renderLines(); refresh();
}
/* a line's amount is qty x rate */
function amt(l){ return Math.round((Number(l.qty)||0)*(Number(l.rate)||0)*100)/100; }
function totals(){ var sub=0; lines.forEach(function(l){sub+=amt(l);}); sub=Math.round(sub*100)/100; var g=$('gst').checked?Math.round(sub*5)/100:0; return {sub:sub,gst:g,total:Math.round((sub+g)*100)/100}; }
function renderLines(){
  $('lines').innerHTML=lines.map(function(l,i){
    return '<tr data-i="'+i+'"><td><input class="l-desc" value="'+esc(l.desc)+'"></td><td><input class="l-qty" type="number" step="0.5" value="'+esc(l.qty)+'"></td><td><input class="l-rate" type="number" step="0.01" value="'+esc(l.rate)+'"></td><td class="n">'+money(amt(l))+'</td><td><button class="btn ghost sm l-del" type="button">&times;</button></td></tr>';
  }).join('');
}
$('lines').addEventListener('input',function(e){
  var tr=e.target.closest('tr'); if(!tr) return; var l=lines[parseInt(tr.dataset.i,10)]; if(!l) return;
  if(e.target.classList.contains('l-desc')) l.desc=e.target.value; else if(e.target.classList.contains('l-qty')) l.qty=e.target.value; else if(e.target.classList.contains('l-rate')) l.rate=e.target.value;
  l.auto=false; tr.querySelector('.n').textContent=money(amt(l)); refresh();
});
$('lines').addEventListener('click',function(e){ var b=e.target.closest('.l-del'); if(!b) return; lines.splice(parseInt(b.closest('tr').dataset.i,10),1); renderLines(); refresh(); });
$('addLine').addEventListener('click',function(){ lines.push({desc:'',qty:1,rate:0}); renderLines(); refresh(); });
$('addHot').addEventListener('click',function(){ lines.push({desc:'Hot shot (rush) delivery',qty:1,rate:rate('HOT','srate',25)}); renderLines(); refresh(); });
$('addDisc').addEventListener('click',function(){ lines.push({desc:'Discount',qty:1,rate:-0}); renderLines(); refresh(); });
$('priceBtn').addEventListener('click',priceIt);

/* ---- reading and writing the form */
function collect(){
  return {id:curId,customer:{code:$('cCode').value,name:$('cName').value,contact:$('cContact').value,email:$('cEmail').value,phone:$('cPhone').value},
    event:{name:$('eName').value,type:$('eType').value,date:$('eDate').value,time:$('eTime').value,pickup:$('ePickup').value,venue:$('eVenue').value,pieces:$('ePieces').value,trips:$('eTrips').value,setup_people:$('eSetP').value,setup_hours:$('eSetH').value},
    driver_pay:$('eDpay').value,
    lines:lines.map(function(l){return {desc:l.desc,qty:l.qty,rate:l.rate,auto:!!l.auto};}),gst:$('gst').checked,valid_until:$('valid').value,notes:$('notes').value,terms:$('terms').value};
}
function fill(q){
  curId=q?q.id:''; curStatus=q?q.status:'draft';
  var c=q?q.customer:{}, e=q?q.event:{};
  $('cName').value=c.name||''; $('cCode').value=c.code||''; $('cContact').value=c.contact||''; $('cEmail').value=c.email||''; $('cPhone').value=c.phone||'';
  $('eName').value=e.name||''; $('eType').value=e.type||'Special Event'; $('eDate').value=e.date||''; $('eTime').value=e.time||''; $('ePickup').value=e.pickup||''; $('eVenue').value=e.venue||'';
  $('ePieces').value=e.pieces||1; $('eTrips').value=e.trips||1; $('eSetP').value=e.setup_people||0; $('eSetH').value=e.setup_hours||0;
  $('eDpay').value=q&&q.driver_pay?q.driver_pay:''; curLinked=q&&q.linked?q.linked.length:0;
  lines=q?q.lines.map(function(l){return {desc:l.desc,qty:l.qty,rate:l.rate,auto:!!l.auto};}):[];
  $('gst').checked=q?q.gst!==false:true; $('valid').value=q?q.valid_until||'':plusDays(30); $('notes').value=q?q.notes||'':''; $('terms').value=q?q.terms||'':DEFAULT_TERMS;
  renderLines(); refresh(); msg('');
}
function msg(t,cls){ $('msg').innerHTML=t?'<div class="msg '+(cls||'ok')+'">'+esc(t)+'</div>':''; }

/* ---- the customer-facing quote, kept in step with the form */
function quoteText(){
  var f=collect(), t=totals(), L=[];
  L.push('Smart Choice Delivery - Quote '+(curId||'(draft)'));
  L.push('Date: '+fmtDate(today())+(f.valid_until?'   Valid until: '+fmtDate(f.valid_until):''));
  L.push('For: '+f.customer.name+(f.customer.contact?' ('+f.customer.contact+')':''));
  if(f.event.name) L.push('Event: '+f.event.name+(f.event.type?' ('+f.event.type+')':''));
  if(f.event.date||f.event.time) L.push('When: '+[fmtDate(f.event.date),f.event.time].filter(Boolean).join(', '));
  if(f.event.pickup) L.push('Pick up: '+f.event.pickup);
  if(f.event.venue) L.push('Deliver to: '+f.event.venue);
  L.push('');
  lines.forEach(function(l){ if(l.desc) L.push(l.desc+': '+(Number(l.qty)!==1?l.qty+' x '+money(l.rate)+' = ':'')+money(amt(l))); });
  L.push(''); L.push('Subtotal: '+money(t.sub)); if($('gst').checked) L.push('GST (5%): '+money(t.gst)); L.push('TOTAL: '+money(t.total));
  if(f.notes) { L.push(''); L.push(f.notes); }
  if(f.terms) { L.push(''); L.push(f.terms); }
  L.push(''); L.push('Smart Choice Delivery, 403-880-9822');
  return L.join('\n');
}
function refresh(){
  var t=totals(), f=collect();
  var tr=Math.max(1,parseInt($('eTrips').value,10)||1); $('eEach').value=money(t.sub/tr)+' ('+tr+' trip'+(tr===1?'':'s')+')';
  $('totalsLine').innerHTML='Subtotal <b>'+money(t.sub)+'</b>'+($('gst').checked?' &middot; GST <b>'+money(t.gst)+'</b>':'')+' &middot; Total <b>'+money(t.total)+'</b>';
  var ev=f.event, c=f.customer;
  $('doc').innerHTML='<div class="top"><div><h3>Smart Choice Delivery</h3><div class="sub">Calgary, Alberta &middot; 403-880-9822</div></div><div class="qno"><b>QUOTE</b><br>'+esc(curId||'Draft')+'<br>Date: '+esc(fmtDate(today()))+(f.valid_until?'<br>Valid until: '+esc(fmtDate(f.valid_until)):'')+'</div></div>'
   +'<div class="cols"><div><h4>Prepared for</h4>'+esc(c.name||'')+(c.contact?'<br>'+esc(c.contact):'')+(c.email?'<br>'+esc(c.email):'')+(c.phone?'<br>'+esc(c.phone):'')+'</div>'
   +'<div><h4>Event</h4>'+esc(ev.name||'')+(ev.type?' <span class="sub">('+esc(ev.type)+')</span>':'')+(ev.date||ev.time?'<br>'+esc([fmtDate(ev.date),ev.time].filter(Boolean).join(', ')):'')+(ev.pickup?'<br>Pick up: '+esc(ev.pickup):'')+(ev.venue?'<br>Deliver to: '+esc(ev.venue):'')+'</div></div>'
   +'<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>'+lines.filter(function(l){return l.desc;}).map(function(l){return '<tr><td>'+esc(l.desc)+'</td><td class="r">'+esc(l.qty)+'</td><td class="r">'+money(l.rate)+'</td><td class="r">'+money(amt(l))+'</td></tr>';}).join('')+'</tbody></table>'
   +'<table class="tot" style="margin-top:8px;"><tbody><tr><td class="r">Subtotal</td><td class="r" style="width:110px">'+money(t.sub)+'</td></tr>'+($('gst').checked?'<tr><td class="r">GST (5%)</td><td class="r">'+money(t.gst)+'</td></tr>':'')+'<tr class="grand"><td class="r">Total</td><td class="r">'+money(t.total)+'</td></tr></tbody></table>'
   +(f.notes?'<div class="small">'+esc(f.notes)+'</div>':'')+(f.terms?'<div class="small" style="color:#666;">'+esc(f.terms)+'</div>':'');
}
document.querySelectorAll('input,select,textarea').forEach(function(el){ el.addEventListener('input',function(){ if(!el.closest('#lines')) refresh(); }); el.addEventListener('change',function(){ if(!el.closest('#lines')) refresh(); }); });

/* ---- saving and the list */
async function api(body){
  var r=await fetch('/api/event-quotes',body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);
  if(r.status===401){ location.href='/login.html?redirect='+encodeURIComponent(location.pathname); throw new Error('Not signed in'); }
  var d=await r.json().catch(function(){return {};}); if(!r.ok) throw new Error(d.error||('Status '+r.status)); return d;
}
async function save(){
  try{ var q=await api(collect()); curId=q.id; curStatus=q.status; refresh(); msg('Saved as '+q.id+' ('+money(q.total)+').'+(q.customer.code?'':' No shop code is set, so drivers cannot enter deliveries against this quote or bill it in QuickBooks until you add one.')+(q.driver_pay>0?'':' No driver pay is set, so the usual event pay will apply.'),q.customer.code&&q.driver_pay>0?'ok':'err'); loadList(); return q; }
  catch(e){ msg(e.message,'err'); return null; }
}
async function loadList(){
  try{
    var d=await api(); var qs=d.quotes;
    $('list').innerHTML=qs.length?'<table class="list"><thead><tr><th>Quote</th><th>Customer / event</th><th>Event date</th><th class="n" style="text-align:right">Total</th><th>Deliveries</th><th>Status</th><th></th></tr></thead><tbody>'+qs.map(function(q){
      return '<tr><td>'+esc(q.id)+'</td><td>'+esc(q.customer)+(q.event?'<div class="hint" style="margin:0">'+esc(q.event)+'</div>':'')+'</td><td>'+esc(fmtDate(q.event_date))+'</td><td style="text-align:right">'+money(q.total)+'</td><td>'+q.linked+' of '+q.trips+'</td><td><select class="stSel" data-id="'+esc(q.id)+'" style="width:auto;padding:4px;">'+['draft','sent','accepted','declined','cancelled'].map(function(s){return '<option'+(s===q.status?' selected':'')+'>'+s+'</option>';}).join('')+'</select></td><td><button class="btn ghost sm open" data-id="'+esc(q.id)+'" type="button">Open</button> <button class="btn ghost sm dup" data-id="'+esc(q.id)+'" type="button">Copy</button></td></tr>';
    }).join('')+'</tbody></table>':'<div class="hint">No quotes saved yet.</div>';
  }catch(e){ $('list').innerHTML='<div class="msg err">Could not load: '+esc(e.message)+'</div>'; }
}
$('list').addEventListener('click',async function(e){
  var o=e.target.closest('.open'), d=e.target.closest('.dup');
  try{
    if(o){ fill(await api0(o.dataset.id)); window.scrollTo({top:0,behavior:'smooth'}); }
    if(d){ var q=await api0(d.dataset.id); q.id=''; q.status='draft'; fill(q); msg('Copied. Change what you need and save it as a new quote.','ok'); window.scrollTo({top:0,behavior:'smooth'}); }
  }catch(x){ msg(x.message,'err'); }
});
async function api0(id){ var r=await fetch('/api/event-quotes?id='+encodeURIComponent(id)); var d=await r.json(); if(!r.ok) throw new Error(d.error||'Could not open'); return d; }
$('list').addEventListener('change',async function(e){
  var s=e.target.closest('.stSel'); if(!s) return;
  try{ await api({action:'status',id:s.dataset.id,status:s.value}); if(s.dataset.id===curId) curStatus=s.value; msg(s.dataset.id+' marked '+s.value+'.','ok'); }catch(x){ msg(x.message,'err'); loadList(); }
});
$('saveBtn').addEventListener('click',save);
$('newBtn').addEventListener('click',function(){ fill(null); });
$('printBtn').addEventListener('click',async function(){ if(!curId){ var q=await save(); if(!q) return; } window.print(); });
$('copyBtn').addEventListener('click',function(){ var t=quoteText(); (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ msg('Quote text copied.','ok'); }).catch(function(){ msg('Could not copy. Select the quote on the right and copy it.','err'); }); });
$('mailBtn').addEventListener('click',async function(){
  if(!curId){ var q=await save(); if(!q) return; }
  var f=collect(); location.href='mailto:'+encodeURIComponent(f.customer.email||'')+'?subject='+encodeURIComponent('Delivery quote '+curId+(f.event.name?' - '+f.event.name:''))+'&body='+encodeURIComponent(quoteText());
});
/* shop pick fills the customer */
$('cName').addEventListener('change',function(){ var s=SHOPS[$('cName').value.toLowerCase()]; if(s){ $('cCode').value=String(s.name).split(/\s+/)[0].toUpperCase(); if(!$('ePickup').value) $('ePickup').value=s.address||''; } });
gate.then(function(ok){ if(!ok) return;
  fetch('/api/rates').then(function(r){return r.json();}).then(function(r){ RATES=r||{}; }).catch(function(){});
  fetch('/api/shops').then(function(r){return r.json();}).then(function(l){ $('shopList').innerHTML=l.map(function(s){ SHOPS[s.name.toLowerCase()]=s; return '<option value="'+esc(s.name)+'"></option>'; }).join(''); }).catch(function(){});
  loadList();
});
fill(null);
var qid=new URLSearchParams(location.search).get('id'); if(qid) gate.then(function(){ return api0(qid); }).then(fill).catch(function(e){ msg(e.message,'err'); });
</script>
</body>
</html>
