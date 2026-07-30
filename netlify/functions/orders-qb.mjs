function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
  return str;
}
function toCSVRow(fields) { return fields.map(csvEscape).join(','); }

const QB_ZONE_MAP = {
  AIR:  { product:'OUT OF TOWN:AIR',          desc:'AIRDRIE $25 BASE RATE +$3 EACH ADDITIONAL PCE/ OR AS QUOTED' },
  BAK1: { product:'BAKERY:BAK1',              desc:'BAK1 CITY BASIC $15  1 PKG  OR AS QUOTED' },
  BAK2: { product:'BAKERY:BAK2',              desc:'BAK2 CITY $20 2-3 PKG OR AS QUOTED' },
  BAKP: { product:'BAKERY:BAKP',              desc:'BAKERY $15 OR AS QUOTED FOR MULTIPLE PKGS AND EVENTS' },
  BAL:  { product:'OUT OF TOWN:BAL',          desc:'BALZAC $22 BASE RATE +$3 EACH ADDITIONAL PCE/ OR AS QUOTED' },
  BAS:  { product:'GIFT BASKETS:BAS',         desc:'GIFT BASKETS IN CITY $13/1 PIECE + $2.50 EACH EXTRA PIECE OR AS QUOTED' },
  BEI:  { product:'OUT OF TOWN:BEI',          desc:'BEISEKER $50' },
  BLK:  { product:'OUT OF TOWN:BLK',          desc:'BLACK DIAMOND $35 BASE RATE' },
  BNF:  { product:'OUT OF TOWN:BNF',          desc:'BANFF BASE RATE' },
  BPW:  { product:'OUT OF TOWN:BPW',          desc:'BEARSPAW COUNTRY ESTATES $25' },
  BRG:  { product:'OUT OF TOWN:BRG',          desc:'BRAGG CREEK $35' },
  BTY:  { product:'BEAUTY PRODUCTS:BTY',      desc:'BEAUTY PRODUCTS $15/1 PIECE +$1 PER EXTRA PIECE' },
  C1:   { product:'CITY WIDE:C1',             desc:'CITY WIDE SHOP SPECIFIC $11 + $3 PER EXTRA PIECE/OR AS QUOTED' },
  C2:   { product:'CITY WIDE:C2',             desc:'CITY WIDE $12 + $3 PER EXTRA PIECE/OR AS QUOTED' },
  C3:   { product:'CITY WIDE:C3',             desc:'CITY WIDE $13 + $3 PER EXTRA PIECE/OR AS QUOTED' },
  C4:   { product:'CITY WIDE:C4',             desc:'CITY WIDE SHOP SPECIFIC $14 +$3 PER EXTRA PIECE OR AS QUOTED' },
  C5:   { product:'CITY WIDE:C5',             desc:'CITY WIDE SHOP SPECIFIC $15 + $3 PER EXTRA PIECE/OR AS QUOTED' },
  CAN:  { product:'OUT OF TOWN:CAN',          desc:'CANMORE $80' },
  CAR:  { product:'OUT OF TOWN:CAR',          desc:'OUT OF TOWN CARSLAND BASE $60' },
  CHE:  { product:'OUT OF TOWN:CHE',          desc:'CHESTERMERE $25/1 PCE + $3 PER EXTRA PIECE' },
  COC:  { product:'OUT OF TOWN:COC',          desc:'COCHRANE $30' },
  COR:  { product:'CORPORATE:COR',            desc:'PICK UP DELIVERY AND RETURN OF CORPORATE' },
  CRO:  { product:'OUT OF TOWN:CRO',          desc:'CROSSFIELD $45' },
  DEW:  { product:'OUT OF TOWN:DEW',          desc:'DEWINTON $22' },
  DOC:  { product:'DOCUMENTS:DOC',            desc:'DOCUMENT SERVICE PICK UP & DELIVERY $18 OR AS QUOTED' },
  DVA:  { product:'OUT OF TOWN:DVA',          desc:'DIAMOND VALLEY $50 BASE RATE' },
  ERV:  { product:'OUT OF TOWN:ERV',          desc:'ELBOW RIVER ESTATES $22' },
  EVA:  { product:'OUT OF TOWN:EVA',          desc:'ELBOW VALLEY $22' },
  FUN:  { product:'SPECIAL EVENTS:FUN',       desc:'FUNERAL $15/1 PIECE + $3/EACH EXTRA PIECE' },
  FUNO: { product:'SPECIAL EVENTS:FUNO',      desc:'FUNERAL OUT OF TOWN $25 +$3 EACH ADDITIONAL PIECE' },
  HOT:  { product:'CITY WIDE:HOT',            desc:'HOT SHOT RATE $25 IN ADDITION TO BASE RATE / OR AS QUOTED' },
  HPT:  { product:'OUT OF TOWN:HPT',          desc:'HERITAGE POINT $20' },
  HRV:  { product:'OUT OF TOWN:HRV',          desc:'HIGH RIVER $40' },
  KAN:  { product:'OUT OF TOWN:KAN',          desc:'KANANASKIS $50' },
  LAN:  { product:'OUT OF TOWN:LAN',          desc:'LANGDON $30' },
  LYA:  { product:'OUT OF TOWN:LYA',          desc:'LYALTA $38' },
  MDF:  { product:'OUT OF TOWN:MDF',          desc:'MD FOOTHILLS DEWINTON' },
  MIL:  { product:'OUT OF TOWN:MIL',          desc:'MILLARVILLE $45 BASE RATE' },
  NAN:  { product:'OUT OF TOWN:NAN',          desc:'NANTON $65' },
  NCH:  { product:'NCH',                      desc:'NO CHARGE' },
  OKO:  { product:'OUT OF TOWN:OKO',          desc:'OKOTOKS $25' },
  PRI:  { product:'OUT OF TOWN:PRI',          desc:'PRIDDIS $30' },
  RVS:  { product:'OUT OF TOWN:RVS',          desc:'ROCKY VIEW COUNTY SW SE $23' },
  SBK:  { product:'OUT OF TOWN:SBK',          desc:'SPRINGBANK $25' },
  SC2:  { product:'SMARTCHOICE DELIVERY:SC2', desc:'SMART CHOICE DELIVERY SC2' },
  SC3:  { product:'SMARTCHOICE DELIVERY:SC3', desc:'SMART CHOICE DELIVERY SC3' },
  SET:  { product:'SPECIAL EVENTS:SET',       desc:'EVENT SET UP $35/HR/PERSON or any part thereof' },
  SPEC: { product:'SPECIAL EVENTS:SPEC',      desc:'SPECIAL EVENTS $25 +$5 EACH ADDITIONAL PCE/ OR AS QUOTED' },
  SPL:  { product:'SEASONAL PLANTERS:SPL',    desc:'SEASONAL PLANTERS $20 PLUS $5 EACH ADDITIONAL' },
  SPO:  { product:'SEASONAL PLANTERS:SPO',    desc:'SEASONAL PLANTERS OUT OF TOWN: $25 OR AS QUOTED' },
  STR:  { product:'OUT OF TOWN:STR',          desc:'STRATHMORE $35' },
  TSU:  { product:'OUT OF TOWN:TSU',          desc:'TSUU TSIINA' },
  TVA:  { product:'OUT OF TOWN:TVA',          desc:'TURNER VALLEY $50' },
  WAI:  { product:'WHOLESALE:WAI',            desc:'WHOLESALE PICK UP AIRDRIE $25 + $1.5 PER EXTRA CASE' },
  WCH:  { product:'WHOLESALE:WCH',            desc:'WHOLESALE PICK UP CHESTERMERE $25 + $1.5 PER EXTRA CASE' },
  WCO:  { product:'WHOLESALE:WCO',            desc:'WHOLESALE PICK UP COCHRANE $30 +$1.5 PER EXTRA CASE' },
  WED:  { product:'SPECIAL EVENTS:WED',       desc:'WEDDING IN CITY $25 BASE + $5/EACH ADDITIONAL PIECE' },
  WEDO: { product:'SPECIAL EVENTS:WEDO',      desc:'WEDDING OUT OF TOWN BASE RATE PLUS $5 PER EXTRA PCE / OR AS QUOTED' },
  WHR:  { product:'WHOLESALE:WHR',            desc:'WHOLESALE PICK UP HIGH RIVER $40 BASE+ $1.5 PER EXTRA CASE' },
  WLO:  { product:'WHOLESALE:WLO',            desc:'WHOLESALE PICK UP LONGVIEW $60 + $1.5 PER EXTRA CASE' },
  WLY:  { product:'WHOLESALE:WLY',            desc:'OUT OF TOWN WHOLESALE - LYALTA BASE RATE $38 PLUS $1.5 FOR EACH ADDITIONAL CASE' },
  WPH:  { product:'WHOLESALE:WPH',            desc:'WHOLESALE PICK UP AIRPORT $15 + $1 PER EXTRA CASE' },
  WPO:  { product:'WHOLESALE:WPO',            desc:'WHOLESALE PICK UP OKOTOKS $25 + $1.5 EXTRA CASE' },
  WPU:  { product:'WHOLESALE:WPU',            desc:'WHOLESALE PICK UP $15 + $1.5 EXTRA CASE +SEASONAL GREENS $1.5 PER EXTRA CASE' },
  WST:  { product:'WHOLESALE:WST',            desc:'WHOLESALE PICK UP STRATHMORE $38 + $1.5 PER EXTRA CASE' },
  WTV:  { product:'WHOLESALE:WTV',            desc:'WHOLESALE PICK UP TURNER VALLEY $50 + $1.5 PER EXTRA CASE' },
  WBR:  { product:'WHOLESALE:WBR',            desc:'WHOLESALE PICK UP BRAGG CREEK $40 + $1.5 PER EXTRA CASE' },
};

const QB_CUSTOMERS = {
  AC:'GROWER DIRECT ACADIA', AF:'AL FRACHE FLOWERS LTD', AL:"ALLAN'S FLOWERS",
  ALP:'ALPINE BLOOMS', AM:'AMAZING FLORAL WHOLESALE LTD', AMB:'Amborella Floral Studio Inc',
  AT:'ATLANTIC ANTIGUA WHOLESALE LTD', AV:'AVENIDA FLOWERS', B9:'BLOOMS ON 9TH',
  BA:'BERNARD ANDERSON', BAD:'BLOOMS & DESIGN', BBB:'BLOOM BY BUNCHES',
  BB:'BB BASKETS  INC', BEN:'BENJI BLOOMS', BK:'BASKETS & BEYOND',
  BOP:'BIRD OF PARADISE FLORAL STUDIO', BQ:'BRIE & BANQUET', BV:'BONAVISTA FLOWERS',
  BY:'BLOSSOMS YYC', CE:'CREATIVE EDGE', CF:'CLAEREN FLOWERS',
  CH:'CASHYN HOMES', CK:'CHICKWEED FLORALS', CLF:'CALGARY LOCAL FLORIST',
  CLW:'CUSTOM LASER WORKS', CN:'CREATIONS BY NAZIA', CW:"CHARLOTTE'S WEB",
  DA:'DAHLIA', DB:'Durand Bridal and Formal Wear', DC:'DIVINE FLORAL YYC',
  DE:'DEEVINE', DF:'DAHLIA FLOWERS', DO:'DESIGNING ON THE EDGE', DV:'DEER VALLEY FLORIST',
  FN:'FLOWER AURA BY NATASHA', FA:'FLOWER ARTISTRY', FB:'FLOWERS & BEYOND',
  FCU:'FLOWER CULTURE', FC:'FLOWER CENTER', FHY:'FLORAL HAVEN YYC',
  FI:'Finesse Flowers Inc.', FJ:'flowers by JANIE', FLO:'DEYAR FLOART STUDIO',
  FL:'FLEURISH', FM:'FLOWER MAGIC', FO:'FORGET ME NOT FLOWERS',
  FPA:'FUNKY PETALS AIRDRIE', FPK:'FUNKY PETALS KENSINGTON', FS:'FLORISTS SUPPLY',
  FV:'FOXGLOVE STUDIO', FW:'FLOWER WHISPERS', FX:'FLOWER CHIX',
  GF:'GARDENIA FLOWERS', GR:'GYPSY ROSE', HB:'HOUSE OF BLOOMS',
  HC:'LAURIE DAVIDGE', HH:'HOLLAND HOUSE FLOWERS', HP:'Hawthorn Plains',
  IF:'INCREDIBLE FLORIST GROUP', IT:'ITINERANTE FLOWERS', KF:'KENSINGTON FLORIST MK',
  LB:'LAUREN BELL', LM:'LA MAISON FLOWER STUDIO', MA:'MANDALA FLORAL INC',
  MB:'MBS CANADA', MFM:'MARLOW FLORAL WORKS MISSION', MFS:'MARLOW FLORAL WORKS SOUTH CENTRE',
  MM:'MICHELE MASTERSON BOTANICAL DESIGN', MR:'MAY ROSE FLORIST', MY:'MY FLORIST',
  MZ:'MENZIES', NB:'NUTRITION & BEYOND', NR:'NECTARE & ROOT',
  NW:'Northwest Florist Ltd.', OA:'OASIS FLOWER SHOP', OF:'OKOTOKS FLOWERS',
  OR:'OLIVER REAL ESTATE INC', OT:'Orso Trades Inc', PA:'PANDA 130',
  PCA:'PANDA CANADA', PCO:'PANDA COCHRANE', PCR:'TOUCH OF PETALS/PANDA CROWFOOT',
  PD:'POSH DESIGNS', PO:'PURPLE ORCHID', PS:'PRETTY SWEET',
  PSU:'PANDA SUNRIDGE', QF:'QFRESH LOGISTICS', SB:'SBe Wholesale Flowers',
  SCV:'SWEET CAKES BY VERNZ', SF:'SMALL FLOWER BOUTIQUE', SK:'SK FLORIST',
  SR:'SWEET ROOTS STUDIO', SRS:'SWEET ROOTS STUDIO', SV:'Savannah Flowers Corp',
  SW:'SWEET WILLIAMS CO', SZ:'STEMZ FLORIST & TREASURES', TD:'TRIMS & DREAMS',
  TF:'THALEA FLOWERS', TH:'TREEHOUSE', TNX:'TNX TROPICAL',
  TP:'TOUCH OF PETALS', TW:'TWIGS & COMPANY', UR:'Urban Roots Home',
  VA:'VAVA BLOOM', VC:'VIOLET & CO', VCW:'VILLAGE CRAFT WINEMAKER',
  VT:'VINTAGE THISTLE STETTLER', WA:'WILD ABOUT FLOWERS',
  WF:'WILDFLOWERS AT KENSINGTON', WO:'WILD ORCHID',
  YA:'YARA FLOWERS LTD', YR:'YRENE RAMIREZ',
};

function formatDateQB(d) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function getWeekDates(weekEndStr) {
  const end = new Date(weekEndStr + 'T23:59:59');
  const start = new Date(weekEndStr + 'T00:00:00');
  start.setDate(end.getDate() - 6);
  return { start, end };
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const weekEnd = url.searchParams.get('week_end');
    const startInvoice = parseInt(url.searchParams.get('start_invoice') || '1');

    if (!weekEnd) {
      return new Response(JSON.stringify({ error: 'week_end parameter required (YYYY-MM-DD)' }), { status: 400 });
    }

    // Load orders and rates
    const ordersStore = getStore('flower-orders');
    const ratesStore = getStore('flower-rates');

    const { blobs } = await ordersStore.list();
    let allOrders = (await Promise.all(blobs.map(b => ordersStore.get(b.key, { type: 'json' })))).filter(Boolean);

    // Load rate table
    let rates = {};
    try { rates = await ratesStore.get('rates', { type: 'json' }) || {}; } catch(e) {}

    // Default rates fallback
    const DEFAULT_SRATE = { C1:11,C2:12,C3:13,C4:14,C5:15,AIR:25,BAL:22,BEI:50,BNF:100,BPW:25,BRG:35,BTY:15,CAN:80,CAR:60,CHE:25,COC:30,CRO:45,DEW:22,DVA:50,ERV:22,EVA:22,FUN:15,FUNO:25,HOT:25,HPT:20,HRV:40,KAN:65,LAN:30,LYA:38,MDF:25,MIL:45,NAN:75,OKO:25,PRI:30,RVS:23,SBK:25,SC2:40,SC3:60,SPEC:25,SPL:20,SPO:25,STR:35,TSU:25,TVA:50,WAI:25,WCH:25,WCO:30,WED:25,WEDO:50,WHR:40,WLO:60,WLY:38,WPH:15,WPO:25,WPU:15,WST:38 };
    const DEFAULT_SRATEX = { C1:3,C2:3,C3:3,C4:3,C5:3,FUN:3,FUNO:3,SPEC:5,WED:5,WEDO:5,WAI:1.5,WCH:1.5,WCO:1.5,WHR:1.5,WLO:1.5,WLY:1.5,WPH:1,WPO:1.5,WPU:1.5,WST:1.5 };

    // Filter by week
    const { start, end } = getWeekDates(weekEnd);
    const weekOrders = allOrders.filter(o => {
      const d = new Date(o.date || o.received_at || '');
      return d >= start && d <= end;
    });

    // Group by billing shop, then zone — sum shop amounts
    const shopGroups = {};

    weekOrders.forEach(o => {
      const zone = (o.zone_code || '').toUpperCase();
      if (!zone || zone === 'NCH' || zone === 'SC2' || zone === 'SC3') return;
      if (!shopCode || shopCode === 'SCD') return;
      // Determine billing shop
      let shopCode = (o.shop_code || '').toUpperCase();
      
      // For wholesale, billing_party determines who pays
      if (o.delivery_type === 'wholesale' && o.billing_party) {
        const bp = String(o.billing_party);
        // If billing_party is a known shop code, use it
        if (QB_CUSTOMERS[bp.toUpperCase()]) {
          shopCode = bp.toUpperCase();
        } else {
          // Try to extract code from billing_party text
          const firstWord = bp.split(' ')[0].toUpperCase();
          if (QB_CUSTOMERS[firstWord]) shopCode = firstWord;
        }
      }

      if (!shopCode) return;
      if (!shopGroups[shopCode]) shopGroups[shopCode] = {};

      // Calculate shop amount for this order
      const pieces = parseInt(o.total_pieces || 1);
      let amount = 0;

      if (o.shop_pay) {
        // Use stored shop_pay if available
        amount = parseFloat(o.shop_pay) || 0;
      } else {
        // Calculate from rate table
        const r = rates[zone] || {};
        const srate = r.srate || DEFAULT_SRATE[zone] || 0;
        const sratex = r.sratex || DEFAULT_SRATEX[zone] || 0;
        amount = srate + (pieces - 1) * sratex;
      }

      if (!shopGroups[shopCode][zone]) shopGroups[shopCode][zone] = 0;
      shopGroups[shopCode][zone] += amount;
    });

    // Build QB invoice date info
    const weekEndDate = new Date(weekEnd + 'T12:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const weekEndFormatted = `${months[weekEndDate.getMonth()]} ${weekEndDate.getDate()} ${weekEndDate.getFullYear()}`;
    const invoiceDate = formatDateQB(weekEndDate);
    const memo = `WEEK ENDING ${weekEndFormatted} Details Attached Thank you for your business.`;

    const headers = ['*InvoiceNo','*Customer','*InvoiceDate','*DueDate','Terms','Location','Memo',
      'Item(Product/Service)','ItemDescription','ItemQuantity','ItemRate','*ItemAmount','*ItemTaxCode','ItemTaxAmount'];

    const rows = [];
    let invoiceNo = startInvoice;

    // Sort shops alphabetically by customer name
    const sortedShops = Object.keys(shopGroups).sort((a,b) => {
      const ca = QB_CUSTOMERS[a] || a;
      const cb = QB_CUSTOMERS[b] || b;
      return ca.localeCompare(cb);
    });

    sortedShops.forEach(shopCode => {
      const customer = QB_CUSTOMERS[shopCode] || shopCode;
      const zones = shopGroups[shopCode];
      let firstLine = true;

      // Sort zones alphabetically
      Object.keys(zones).sort().forEach(zone => {
        const amount = parseFloat(zones[zone].toFixed(2));
        if (amount <= 0) return;
        const qb = QB_ZONE_MAP[zone] || { product: zone, desc: zone };

        rows.push(toCSVRow([
          firstLine ? invoiceNo : '',
          firstLine ? customer : '',
          firstLine ? invoiceDate : '',
          firstLine ? invoiceDate : '',
          firstLine ? 'Due on receipt' : '',
          '',
          firstLine ? memo : '',
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

    const csv = [toCSVRow(headers), ...rows].join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename="qb-invoices-${weekEnd}.csv"`
      }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500 });
  }
};

export const config = { path: '/api/qb-export' };

