import { getStore } from '@netlify/blobs';

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  var str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
  return str;
}
function toCSVRow(fields) { return fields.map(csvEscape).join(','); }

var QB_ZONE_MAP = {
  AIR:  { product:'OUT OF TOWN:AIR', desc:'AIRDRIE $29 BASE RATE +$3 EACH ADDITIONAL PCE/ OR AS QUOTED' },
  BAK1: { product:'BAKERY:BAK1', desc:'BAK1 CITY BASIC $15 1 PKG OR AS QUOTED' },
  BAK2: { product:'BAKERY:BAK2', desc:'BAK2 CITY $20 2-3 PKG OR AS QUOTED' },
  BAKP: { product:'BAKERY:BAKP', desc:'BAKERY $15 OR AS QUOTED FOR MULTIPLE PKGS AND EVENTS' },
  BAL:  { product:'OUT OF TOWN:BAL', desc:'BALZAC$22 BASE RATE $25 +$3 EACH ADDITIONAL PCE/ OR AS QUOTED' },
  BAS:  { product:'GIFT BASKETS:BAS', desc:'GIFT BASKETS IN CITY $13/1 PIECE + $2.50 EACH EXTRA PIECE OR AS QUOTED' },
  BEI:  { product:'OUT OF TOWN:BEI', desc:'BEISEKER $50 +$3 PER EXTRA PIECE OR AS QUOTED' },
  BNF:  { product:'OUT OF TOWN:BNF', desc:'BANFF $125 +$3 PER EXTRA PIECE OR AS QUOTED' },
  BPW:  { product:'OUT OF TOWN:BPW', desc:'BEARSPAW COUNTRY ESTATES $26 +$3 PER EXTRA PIECE OR AS QUOTED' },
  BRG:  { product:'OUT OF TOWN:BRG', desc:'BRAGG CREEK $40 +$3 PER EXTRA PIECE OR AS QUOTED' },
  C1:   { product:'CITY WIDE:C1', desc:'CITY up to 10 km SHOP SPECIFIC $13.5 + $3 PER EXTRA PIECE/OR AS QUOTED' },
  C2:   { product:'CITY WIDE:C2', desc:'CITY 10-15 km SHOP SPECIFIC $14.5 + $3 PER EXTRA PIECE/OR AS QUOTED' },
  C3:   { product:'CITY WIDE:C3', desc:'CITY 15 to 20 km $15.5 + $3 PER EXTRA PIECE/OR AS QUOTED' },
  C4:   { product:'CITY WIDE:C4', desc:'CITY 20-25 km SHOP SPECIFIC $16.5 +$3 PER EXTRA PIECE OR AS QUOTED' },
  C5:   { product:'CITY WIDE:C5', desc:'CITY WIDE SHOP SPECIFIC $17.5 + $3 PER EXTRA PIECE/OR AS QUOTED' },
  CAN:  { product:'OUT OF TOWN:CAN', desc:'CANMORE $95 +$3 PER EXTRA PIECE OR AS QUOTED' },
  CAR:  { product:'OUT OF TOWN:CAR', desc:'CARSLAND BASE $60 +$3 PER EXTRA PIECE OR AS QUOTED' },
  CHE:  { product:'OUT OF TOWN:CHE', desc:'CHESTERMERE $29/1 PCE +$3 PER EXTRA PIECE OR AS QUOTED' },
  COC:  { product:'OUT OF TOWN:COC', desc:'COCHRANE $32 +$3 PER EXTRA PIECE OR AS QUOTED' },
  COR:  { product:'CORPORATE:COR', desc:'PICK UP DELIVERY AND RETURN OF CORPORATE' },
  CRO:  { product:'OUT OF TOWN:CRO', desc:'CROSSFIELD $45 +$3 PER EXTRA PIECE OR AS QUOTED' },
  DEW:  { product:'OUT OF TOWN:DEW', desc:'DEWINTON $25 +$3 PER EXTRA PIECE OR AS QUOTED' },
  DOC:  { product:'DOCUMENTS:DOC', desc:'DOCUMENT SERVICE PICK UP & DELIVERY $18 OR AS QUOTED' },
  DVA:  { product:'OUT OF TOWN:DVA', desc:'DIAMOND VALLEY $50 +$3 PER EXTRA PIECE OR AS QUOTED' },
  ERV:  { product:'OUT OF TOWN:ERV', desc:'ELBOW RIVER ESTATES $25 +$3 PER EXTRA PIECE OR AS QUOTED' },
  EVA:  { product:'OUT OF TOWN:EVA', desc:'ELBOW VALLEY $25 +$3 PER EXTRA PIECE OR AS QUOTED' },
  FUN:  { product:'SPECIAL EVENTS:FUN', desc:'FUNERAL $17/1 PIECE + $3/EACH EXTRA PIECE' },
  FUNO: { product:'SPECIAL EVENTS:FUNO', desc:'FUNERAL OUT OF TOWN $27+$3 EACH ADDITIONAL PIECE' },
  HAR:  { product:'OUT OF TOWN:HAR', desc:'HARMONY $30 +$3 PER EXTRA PIECE OR AS QUOTED' },
  HOT:  { product:'CITY WIDE:HOT', desc:'HOT SHOT RATE $25 IN ADDITION TO BASE RATE / OR AS QUOTED' },
  HPT:  { product:'OUT OF TOWN:HPT', desc:'HERITAGE POINT $25 v +$3 PER EXTRA PIECE OR AS QUOTED' },
  HRV:  { product:'OUT OF TOWN:HRV', desc:'HIGH RIVER $50 +$3 PER EXTRA PIECE OR AS QUOTED' },
  INT:  { product:'INTERSTORE TRANSFER:INT', desc:'TRANSFER BETWEEN SHOPS IN SAME COMPANY $15 1 PCE/PLUS $2 EACH ADDITIONAL PIECE/ OR AS QUOTED' },
  KAN:  { product:'OUT OF TOWN:KAN', desc:'KANANASKIS $65 OR AS QUOTED' },
  LAN:  { product:'OUT OF TOWN:LAN', desc:'LANGDON $30 +$3 PER EXTRA PIECE OR AS QUOTED' },
  LKL:  { product:'OUT OF TOWN:LAKE LOUISE', desc:'LAKE LOUISE BASE RATE $200 OR AS QUOTED' },
  LYA:  { product:'OUT OF TOWN:LYA', desc:'LYALTA $50 +$3 PER EXTRA PIECE OR AS QUOTED' },
  MDF:  { product:'OUT OF TOWN:MDF', desc:'MDFOOTHILLS DEWINTON $25 +$3 PER EXTRA PIECE OR AS QUOTED' },
  MIL:  { product:'OUT OF TOWN:MIL', desc:'MILLARVILLE $45 +$3 PER EXTRA PIECE OR AS QUOTED' },
  NAN:  { product:'OUT OF TOWN:NAN', desc:'NANTON $75' },
  NCH:  { product:'NCH', desc:'NO CHARGE' },
  OKO:  { product:'OUT OF TOWN:OKO', desc:'OKOTOKS $28' },
  OLD:  { product:'OUT OF TOWN:OLD', desc:'OLDS $100 OR AS QUOTED' },
  PRI:  { product:'OUT OF TOWN:PRI', desc:'PRIDDIS $30 + $3 PER EXTRA CASE OR AS QUOTED' },
  QUOTE: { product:'QUOTES:QUOTE', desc:'AS QUOTED' },
  RED:  { product:'OUT OF TOWN:RED', desc:'RED DEER $175 + $3/EACH EXTRA PIECE OR AS QUOTED' },
  RURALKM: { product:'OUT OF TOWN:RURALKM', desc:'RURAL KM BASED 0R AS QUOTED' },
  RVN:  { product:'OUT OF TOWN:RVN', desc:'ROCKY VIEW COUNTY NW NE $25 + $3 PER EXTRA CASE OR AS QUOTED' },
  RVS:  { product:'OUT OF TOWN:RVS', desc:'ROCKY VIEW COUNTY SW SE $25 + $2 PER EXTRA CASE OR AS QUOTED' },
  RWM:  { product:'RWM', desc:'REDWOOD MEADOWS $37 +$3 PER EXTRA PIECE OR AS QUOTED' },
  SBK:  { product:'OUT OF TOWN:SBK', desc:'SPRINGBANK $27 + $2 PER EXTRA CASE OR AS QUOTED' },
  SC2:  { product:'SMARTCHOICE DELIVERY:SC2', desc:'SMART CHOICE DELIVERY SC2' },
  SC3:  { product:'SMARTCHOICE DELIVERY:SC3', desc:'SMART CHOICE DELIVERY SC3' }, // inactive in QuickBooks until needed
  SET:  { product:'SPECIAL EVENTS:SET', desc:'EVENT SET UP $35/HR/PERSON or any part thereof' },
  SP2:  { product:'SEASONAL PLANTERS:SP2', desc:'SEASONAL PLANTERS PAIR PLUS $5 PER EXTRA' },
  SPEC: { product:'SPECIAL EVENTS:SPEC', desc:'SPECIAL EVENTS $27 +$5 EACH ADDITIONAL PCE/ OR AS QUOTED' },
  SPL:  { product:'SEASONAL PLANTERS:SPL', desc:'SEASONAL PLANTERS $20 PLUS $5 EACH ADDITIONAL' },
  SPLO: { product:'SEASONAL PLANTERS:SPLO', desc:'SEASONAL PLANTERS OUT OF TOWN: ZONE RATE PLUS $5 EACH ADDITIONAL' },
  SPO:  { product:'SPECIAL EVENTS:SPECIAL EVENTS - OUTOF TOWN', desc:'SPECIAL EVENTS OUT OF TOWN AS QUOTED' },
  STR:  { product:'OUT OF TOWN:STR', desc:'STRATHMORE $38 +TSUUT\'INA WITHIN $10 KM OF CITY LIMITS OR RURAL KM BEYOND 10 KM + $2 PER EXTRA CASE OR AS QUOTED' },
  TSA:  { product:'OUT OF TOWN:TSA', desc:'TSUUT\'INA ADJACENT COMMUNITIES $25 + $2 PER EXTRA CASE+$2 Seasonal Greens' },
  TSU:  { product:'OUT OF TOWN:TSU', desc:'TSUUT\'INA WITHIN $10 KM OF CITY LIMITS OR RURAL km beyond 10 KM + $2 PER EXTRA CASE+$2 Seasonal Greens' },
  WAI:  { product:'WHOLESALE:WAI', desc:'WHOLESALE PICK UP AIRDRIE $29 + $2 PER EXTRA CASE + $2 Seasonal Greens' },
  WCH:  { product:'WHOLESALE:WCH', desc:'WHOLESALE PICK UP CHESTERMERE $29 + $2 PER EXTRA CASE+$2 Seasonal Greens' },
  WCO:  { product:'WHOLESALE:WCO', desc:'WHOLESALE PICK UP COCHRANE $32 + $2 PER EXTRA CASE+$2 Seasonal Greens' },
  WED:  { product:'SPECIAL EVENTS:WED', desc:'WEDDING IN CITY $27 BASE + $5/EACH ADDITIONAL PIECE or As Quoted' },
  WEDO: { product:'SPECIAL EVENTS:WEDO', desc:'WEDDING OUT OF TOWN BASE RATE PLUS $5 PER EXTRA PCE / OR AS QUOTED' },
  WHR:  { product:'WHOLESALE:WHR', desc:'WHOLESALE PICK UP HIGH RIVER $50 BASE+ $2 PER EXTRA CASE+$2 Seasonal Greens' },
  WLO:  { product:'WHOLESALE:WLO', desc:'WHOLESALE PICK UP LONGVIEW $60 + $2 PER EXTRA CASE+$2 Seasonal Greens' },
  WLY:  { product:'WHOLESALE:WLY', desc:'WHOLESALE OUT OF TOWN- LYALTA $50 + $2 PER EXTRA CASE+$2 Seasonal Greens' },
  WPH:  { product:'WHOLESALE:WPH', desc:'WHOLESALE PICK HOLLAND $20 + $2 PER EXTRA CASE+$2 Seasonal Greens' },
  WPO:  { product:'WHOLESALE:WPO', desc:'WHOLESALE PICK UP OKOTOKS $28 + $2 PER EXTRA CASE+$2 Seasonal Greens' },
  WPU:  { product:'WHOLESALE:WPU', desc:'WHOLESALE PICK UP $17 + $2 EXTRA CASE +SEASONAL GREENS $2 PER EXTRA CASE' },
  WRU:  { product:'WHOLESALE:WRU', desc:'WHOLESALE OVER 20 KM $20 PLUS $2 PER EXTRA CASE' },
  WST:  { product:'WHOLESALE:WST', desc:'WHOLESALE PICK UP STRATHMORE $38 + $2 PER EXTRA CASE' },
};

var NO_DIRECT_BILL = { LB:1, MZ:1, SK:1, BE:1 };

var QB_CUSTOMERS = {
  AC:'GROWER DIRECT ACADIA', AF:'AL FRACHE FLOWERS LTD', AL:"ALLAN'S FLOWERS",
  ALP:'ALPINE BLOOMS', AM:'AMAZING FLORAL WHOLESALE LTD', AMB:'Amborella Floral Studio Inc',
  AV:'AVENIDA FLOWERS', B9:'BLOOMS ON 9TH',
  BA:'BERNARD ANDERSON', BAD:'BLOOMS & DESIGN', BBB:'BLOOM BY BUNCHES',
  BB:'BB BASKETS  INC',BEN:'BENJI BLOOMS', BK:'BASKETS & BEYOND',
  BOP:'BIRD OF PARADISE FLORAL STUDIO', BQ:'BRIE & BANQUET', BV:'BONAVISTA FLOWERS',
  BY:'BLOSSOMS YYC', CE:'CREATIVE EDGE', CF:'CLAEREN FLOWERS',
  CH:'CASHYN HOMES', CK:'CHICKWEED FLORALS', CLF:'CALGARY LOCAL FLORIST',
  CLW:'CUSTOM LASER WORKS', CN:'CREATIONS BY NAZIA', CW:"CHARLOTTE'S WEB",
  DA:'DAHLIA', DB:'Durand Bridal and Formal Wear', DC:'DIVINE FLORAL YYC',
  DE:'DEEVINE', DF:'DAHLIA FLOWERS', DO:'DESIGNING ON THE EDGE', DV:'DEER VALLEY FLORIST',
  FN:'FLOWER AURA BY NATASHA', FA:'FLOWER ARTISTRY', FB:'FLOWERS & BEYOND',
  FCU:'FLOWER CULTURE', FC:'FLOWER CENTER', FHY:'FLORAL HAVEN YYC',
  FI:'Finesse Flowers Inc.', FJ:"JANIE", FLO:'DEYAR FLOART STUDIO',
  FL:'FLEURISH', FM:'FLOWER MAGIC', FO:'FORGET ME NOT FLOWERS',
  FPA:'FUNKY PETALS AIRDRIE', FPK:'FUNKY PETALS KENSINGTON', FS:'FLORISTS SUPPLY',
  FV:'FOXGLOVE STUDIO', FW:'FLOWER WHISPERS', FX:'FLOWER CHIX',
  GF:'GARDENIA FLOWERS', GR:'GYPSY ROSE', HB:'HOUSE OF BLOOMS',
  HC:'LAURIE DAVIDGE', HH:'HOLLAND HOUSE FLOWERS', HP:'Hawthorn Plains',
  IF:'INCREDIBLE FLORIST GROUP', IT:'ITINERANTE FLOWERS', KF:'KENSINGTON FLORIST MK',
  LM:'LA MAISON FLOWER STUDIO', MA:'MANDALA FLORAL INC',
  MB:'MBS CANADA', MFM:'MARLOW FLORAL WORKS MISSION', MFS:'MARLOW FLORAL WORKS SOUTH CENTRE',
  MM:'MICHELE MASTERSON BOTANICAL DESIGN', MR:'MAY ROSE FLORIST', MY:'MY FLORIST',
  NB:'NUTRITION & BEYOND', NR:'NECTARE & ROOT',
  NW:'Northwest Florist Ltd.', OA:'OASIS FLOWER SHOP', OF:'OKOTOKS FLOWERS',
  OR:'OLIVER REAL ESTATE INC', OT:'Orso Trades Inc', PA:'PANDA 130',
  PCA:'PANDA CANADA', PCO:'PANDA COCHRANE', PCR:'TOUCH OF PETALS/PANDA CROWFOOT',
  PD:'POSH DESIGNS', PO:'PURPLE ORCHID', PS:'PRETTY SWEET',
  PSU:'PANDA SUNRIDGE', QF:'QFRESH LOGISTICS', SB:'SBe Wholesale Flowers',
  SCV:'SWEET CAKES BY VERNZ', SF:'SMALL FLOWER BOUTIQUE', 
  SR:'SWEET ROOTS STUDIO', SRS:'SWEET ROOTS STUDIO', SV:'Savannah Flowers Corp',
  SW:'SWEET WILLIAMS CO FLORAL', SZ:'STEMZ FLORIST & TREASURES', TD:'TRIMS & DREAMS',
  TF:'THALEA FLOWERS', TH:'TREEHOUSE', TNX:'TNX TROPICAL',
  TP:"TOUCH OF PETALS/PANDA CROWFOOT", TW:'TWIGS & COMPANY', UR:'Urban Roots Home',
  VA:'VAVA BLOOM', VC:"VIOLET & CO", VCW:'VILLAGE CRAFT WINEMAKER',
  VT:'VINTAGE THISTLE STETTLER', WA:'WILD ABOUT FLOWERS',
  WF:'WILDFLOWERS AT KENSINGTON', WFW:'WEAVER FLORAL WHOLESALE', WO:'WILD ORCHID',
  YA:'YARA FLOWERS LTD', YR:'YRENE RAMIREZ',
  // Added from the Nov 8 shop list. Matched to an existing QuickBooks customer, or (last block) a clean new name that QuickBooks creates on import.
  EF:"ENCHANTED FLORIST LTD", EP:"ENCHANTED PETALS", FT:"FLOWERS AT THE MARKET", FNS:"FLOWER AURA BY NATASHA", FXN:"FLOWER CHIX", IG:"NATHAN REVOAL", LKB:"LUKES DRUGMART", LKK:"LUKES DRUGMART", MF:"MICHELLE",
  // No QuickBooks customer found:
  BC:"BETACUTS", BOB:"BOY O BOY", BU:"BLOOMS & BUTTERFLIES", DEV:"DEVOUR CATERING", FD:"FLORAL DELIVERY", FF:"FALL FOR FLORALS", FG:"FLOWER GALLERY", HV:"HOME VINTER", LFW:"LYNN FLETCHER WEDDINGS", LOT:"LOTTA FLOWERS", LP:"LAUREN PLANTE", LS:"LAUREN STUDIO", LU:"LUNA BLOOM", MJ:"MARKET JUNCTION", ML:"MANUEL LATRUWE", VBH:"SWEET CAKES BY VERNZ", WFC:"WILD FLORALS & CO", WH:"WHIPTT", WHF:"WHITE'S FLOWERS",
};

function formatDateQB(d) {
  var dd = String(d.getDate()).padStart(2,'0');
  var mm = String(d.getMonth()+1).padStart(2,'0');
  var yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function getWeekDates(weekEndStr) {
  var end = new Date(weekEndStr + 'T23:59:59');
  var start = new Date(weekEndStr + 'T00:00:00');
  start.setDate(end.getDate() - 6);
  return { start, end };
}

// Same session check the reports, order-detail and export endpoints use.
// This file builds the QuickBooks invoice CSV - billing amounts for every
// shop - so it must not be reachable by URL alone.
async function requireAuth(req) {
  var cookieHeader = req.headers.get('cookie') || '';
  var match = cookieHeader.match(/scd_session=([a-f0-9]+)/);
  if (!match) return null;
  var sessionsStore = getStore('flower-sessions');
  var session = await sessionsStore.get(match[1], { type: 'json' });
  if (!session || new Date(session.expires_at) < new Date()) return null;
  return session.username;
}

export default async (req) => {
  try {
    var username = await requireAuth(req);
    if (!username) {
      return new Response('Not authenticated. Please sign in at /login.html and try again.', { status: 401, headers: { 'content-type': 'text/plain' } });
    }
    var url = new URL(req.url);
    var weekEnd = url.searchParams.get('week_end');
    var startInvoice = parseInt(url.searchParams.get('start_invoice') || '1');

    if (!weekEnd) {
      return new Response(JSON.stringify({ error: 'week_end parameter required (YYYY-MM-DD)' }), { status: 400 });
    }
    // Load orders and rates
    var ordersStore = getStore('flower-orders');
    var ratesStore = getStore('flower-rates');

    // Fetch just this week's orders, not every order ever saved (loading them all is what made this
    // export time out as the order count grew). Keys embed the week-ending Sunday, so most come back from a
    // fast prefix lookup; older keys, and orders filed under a different week, are recovered by the
    // timestamp in the key, padded either side. The exact date check below decides what is billed.
    var DAYMS = 86400000;
    var wkStartMs = new Date(weekEnd + 'T12:00:00').getTime() - 6 * DAYMS;
    var wkStartIso = new Date(wkStartMs).toISOString().slice(0, 10);
    var padStartMs = new Date(wkStartIso + 'T00:00:00').getTime() - DAYMS;
    var padEndMs = new Date(weekEnd + 'T23:59:59').getTime() + 7 * DAYMS;
    var { blobs: prefixed } = await ordersStore.list({ prefix: 'order_' + weekEnd + '_' });
    var { blobs: everyKey } = await ordersStore.list();
    var nearby = everyKey.filter(b => {
      if (b.key.startsWith('order_' + weekEnd + '_')) return false;
      var m = b.key.match(/^order_(?:\d{4}-\d{2}-\d{2}_)?(\d+)_/);
      if (!m) return false;
      var ts = parseInt(m[1]);
      return ts >= padStartMs && ts <= padEndMs;
    });
    var allOrders = [];
    var wanted = prefixed.concat(nearby);
    for (var i = 0; i < wanted.length; i += 50) {
      var chunk = await Promise.all(wanted.slice(i, i + 50).map(b => ordersStore.get(b.key, { type: 'json' }).catch(() => null)));
      chunk.forEach(o => { if (o) allOrders.push(o); });
    }

    // Load rate table
    var rates = {};
    try { rates = await ratesStore.get('rates', { type: 'json' }) || {}; } catch(e) {}

    // Default rates fallback
    var DEFAULT_SRATE = { C1:11,C2:12,C3:13,C4:14,C5:15,AIR:25,BAL:22,BEI:50,BNF:100,BPW:25,BRG:35,BTY:15,CAN:80,CAR:60,CHE:25,COC:30,CRO:45,DEW:22,DVA:50,ERV:22,EVA:22,FUN:15,FUNO:25,HOT:25,HPT:20,HRV:40,KAN:65,LAN:30,LYA:38,MDF:25,MIL:45,NAN:75,OKO:25,PRI:30,RVS:23,SBK:25,SC2:40,SC3:60,SPEC:25,SPL:20,SPO:25,STR:35,TSU:25,TVA:50,WAI:25,WCH:25,WCO:30,WED:25,WEDO:50,WHR:40,WLO:60,WLY:38,WPH:15,WPO:25,WPU:15,WST:38 };
    var DEFAULT_SRATEX = { C1:3,C2:3,C3:3,C4:3,C5:3,FUN:3,FUNO:3,SPEC:5,WED:5,WEDO:5,WAI:1.5,WCH:1.5,WCO:1.5,WHR:1.5,WLO:1.5,WLY:1.5,WPH:1,WPO:1.5,WPU:1.5,WST:1.5 };

    // Filter by week
 function parseOrderDate(o) {
  var raw = o.date || o.received_at || '';
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  // Handle DD-Mon-YYYY (e.g. 24-Jul-2026)
  var months = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  var monMatch = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (monMatch) return monMatch[3] + '-' + (months[monMatch[2]] || '01') + '-' + monMatch[1].padStart(2,'0');
  // Handle D/M/YYYY
  var dmyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) return dmyMatch[3] + '-' + dmyMatch[2].padStart(2,'0') + '-' + dmyMatch[1].padStart(2,'0');
  return raw.slice(0,10);
}
var startStr = new Date(new Date(weekEnd + 'T12:00:00').getTime() - 6*24*60*60*1000).toISOString().slice(0,10);
    var weekOrders = allOrders.filter(o => {
  var dateStr = parseOrderDate(o);
  return dateStr >= startStr && dateStr <= weekEnd;
});

    // Group by billing shop, then zone — sum shop amounts
    var shopGroups = {};

  weekOrders.forEach(o => {
      var zone = (o.zone_code || '').toUpperCase();
      if (!zone || zone === 'NCH' || zone === 'SC2' || zone === 'SC3') return;
      var shopCode = (o.shop_code || '').toUpperCase().split(' ')[0];
      if (!shopCode || shopCode === 'SCD') return;
    
      // For wholesale, billing_party determines who pays
      if (o.delivery_type === 'wholesale' && o.billing_party) {
        var bp = String(o.billing_party);
        // If billing_party is a known shop code, use it
        if (QB_CUSTOMERS[bp.toUpperCase()]) {
          shopCode = bp.toUpperCase();
        } else {
          // Try to extract code from billing_party text
          var firstWord = bp.split(' ')[0].toUpperCase();
          if (QB_CUSTOMERS[firstWord]) shopCode = firstWord;
        }
      }

      // Clients of wholesalers: not billed directly, so no QuickBooks invoice (the wholesaler is billed through billing_party, handled above).
      if (NO_DIRECT_BILL[shopCode]) return;
      if (!shopCode) return;
      if (!shopGroups[shopCode]) shopGroups[shopCode] = {};

      // Calculate shop amount for this order
      var pieces = parseInt(o.total_pieces || 1);
      var amount = 0;

      if (o.shop_pay) {
        // Use stored shop_pay if available
        amount = parseFloat(o.shop_pay) || 0;
      } else {
        // Calculate from rate table
        var r = rates[zone] || {};
        var srate = r.srate || DEFAULT_SRATE[zone] || 0;
        var sratex = r.sratex || DEFAULT_SRATEX[zone] || 0;
        amount = srate + (pieces - 1) * sratex;
      }

      // Christmas greens upcharge (a quoted delivery's price already includes everything).
      if (!o.quote_id && !o.shop_pay_source && o.xmas_pieces) amount += o.xmas_pieces * (parseFloat(o.xmas_shop_rate) || 0);

      // Deliveries on an event quote get their own invoice line, labelled with the quote number.
      var gKey = o.quote_id ? zone + '|' + o.quote_id : zone;
      if (!shopGroups[shopCode][gKey]) shopGroups[shopCode][gKey] = 0;
      shopGroups[shopCode][gKey] += amount;
    });

    // Build QB invoice date info
    var weekEndDate = new Date(weekEnd + 'T12:00:00');
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var weekEndFormatted = `${months[weekEndDate.getMonth()]} ${weekEndDate.getDate()} ${weekEndDate.getFullYear()}`;
    var invoiceDate = formatDateQB(weekEndDate);
    var memo = `WEEK ENDING ${weekEndFormatted}`;
    var notes = `WEEK ENDING ${weekEndFormatted} Details Attached Thank you for your business.`; // the former Memo text, now in its own Notes column

    var quoteNames = {};
    try {
      var qStore = getStore('flower-event-quotes');
      var qIds = [...new Set(weekOrders.map(o => o.quote_id).filter(Boolean))];
      await Promise.all(qIds.map(async id => { var qq = await qStore.get(id, { type: 'json' }).catch(() => null); if (qq && qq.event) quoteNames[id] = qq.event.name || ''; }));
    } catch (e) {}

    var headers = ['*InvoiceNo','*Customer','*InvoiceDate','*DueDate','Terms','Location','Memo','Notes',
      'Item(Product/Service)','ItemDescription','ItemQuantity','ItemRate','*ItemAmount','*ItemTaxCode','ItemTaxAmount'];

    var rows = [];
    var invoiceNo = startInvoice;

    // Sort shops alphabetically by customer name
    var sortedShops = Object.keys(shopGroups).sort((a,b) => {
      var ca = QB_CUSTOMERS[a] || a;
      var cb = QB_CUSTOMERS[b] || b;
      return ca.localeCompare(cb);
    });

   sortedShops.forEach(shopKey => {
      var code = shopKey.split(' ')[0].toUpperCase();
      var customer = QB_CUSTOMERS[code] || QB_CUSTOMERS[shopKey] || shopKey;
      var zones = shopGroups[shopKey];
      var firstLine = true;
      // Sort zones alphabetically
      Object.keys(zones).sort().forEach(zone => {

      // Sort zones alphabetically

        var amount = parseFloat(zones[zone].toFixed(2));
        if (amount <= 0) return;
        var zn = zone.split('|')[0], qid = zone.split('|')[1] || '';
        var qb = QB_ZONE_MAP[zn] || { product: zn, desc: zn };
        if (qid) qb = { product: (QB_ZONE_MAP.QUOTE ? QB_ZONE_MAP.QUOTE.product : qb.product), desc: ('QUOTE ' + qid + (quoteNames[qid] ? ' ' + quoteNames[qid] : '')).toUpperCase() };

       rows.push(toCSVRow([
          invoiceNo,
          firstLine ? customer : '',
          firstLine ? invoiceDate : '',
          firstLine ? invoiceDate : '',
          firstLine ? 'Due on receipt' : '',
          '',
          firstLine ? memo : '',
          firstLine ? notes : '',
          qb.product,
          qb.desc,
          1,
          amount,
          amount,
          'GST',
          ''
        ]));
        firstLine = false;
      });

      invoiceNo++;
    });

    var csv = [toCSVRow(headers), ...rows].join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename="qb-invoices-${weekEnd}.csv"`
      }
    });

  } catch(e) {
    console.error('QB export failed:', e.stack || e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export var config = { path: '/api/qb-export' };

