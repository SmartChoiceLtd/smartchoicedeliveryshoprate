import { getStore } from '@netlify/blobs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

const DEFAULT_RATES = {
  C1:{drate:8,dratex:1.5,gdpi:0.5,srate:11,sratex:3},
  C2:{drate:8,dratex:1.5,gdpi:0.5,srate:12,sratex:3},
  C3:{drate:8.25,dratex:1.5,gdpi:0.5,srate:13,sratex:3},
  C4:   { drate:8.75,  dratex:1.5, gdpi:0.5,  srate:14, sratex:3 },
  C5:   { drate:14.95, dratex:1.5, gdpi:0.75, srate:23, sratex:3 },
  TSA:  { drate:14.95, dratex:1.5, gdpi:0.75, srate:23, sratex:3 },
  AIR:{drate:16.25,dratex:1.5,gdpi:1,srate:25,sratex:3},
  BAL:{drate:14.3,dratex:1.5,gdpi:0.5,srate:22,sratex:3},
  BNF:{drate:65,dratex:1.5,gdpi:5,srate:100,sratex:3},
  BPW:{drate:16.25,dratex:1.5,gdpi:0.75,srate:25,sratex:3},
  BRG:{drate:22.75,dratex:1.5,gdpi:1,srate:35,sratex:3},
  CAN:{drate:52,dratex:1.5,gdpi:5,srate:80,sratex:3},
  CAR:{drate:45,dratex:1.5,gdpi:5,srate:60,sratex:5},
  CHE:{drate:16.25,dratex:1.5,gdpi:0.75,srate:25,sratex:3},
  COC:{drate:19.5,dratex:1.5,gdpi:1,srate:30,sratex:3},
  CRO:{drate:26,dratex:1.5,gdpi:1,srate:45,sratex:3},
  DEW:{drate:16.25,dratex:1.5,gdpi:0.75,srate:25,sratex:3},
  DVA:{drate:32.5,dratex:1.5,gdpi:1.5,srate:50,sratex:3},
  ERV:{drate:14.3,dratex:1.5,gdpi:0.75,srate:23,sratex:3},
  EVA:{drate:14.3,dratex:1.5,gdpi:0.75,srate:23,sratex:3},
  FUN:{drate:9.75,dratex:1.5,gdpi:0.5,srate:15,sratex:3},
  FUNO:{drate:16.25,dratex:3,gdpi:1,srate:25,sratex:3},
  HOT:{drate:16.25,dratex:0,gdpi:0.5,srate:25,sratex:0},
  HPT:{drate:14.3,dratex:1.5,gdpi:0.75,srate:22,sratex:3},
  HRV:{drate:26,dratex:1.5,gdpi:1.5,srate:40,sratex:3},
  KAN:{drate:45,dratex:1.5,gdpi:3,srate:65,sratex:3},
  LAN:{drate:19.5,dratex:1.5,gdpi:1,srate:30,sratex:3},
  LKL:{drate:130,dratex:1.5,gdpi:3,srate:200,sratex:3},
  LYA:{drate:22.75,dratex:1.5,gdpi:1,srate:38,sratex:3},
  MDF:{drate:16.25,dratex:1.5,gdpi:0.75,srate:25,sratex:3},
  MIL:{drate:27,dratex:1.5,gdpi:2.5,srate:45,sratex:3},
  NAN:{drate:50,dratex:1.5,gdpi:1.5,srate:75,sratex:3},
  NCH:{drate:0,dratex:0,gdpi:0,srate:0,sratex:0},
  OKO:{drate:16.25,dratex:1.5,gdpi:1,srate:25,sratex:3},
  PRI:{drate:19.5,dratex:1.5,gdpi:1,srate:30,sratex:3},
  RED:{drate:113.75,dratex:1.5,gdpi:5,srate:175,sratex:3},
  RVS:{drate:14.95,dratex:1.5,gdpi:1,srate:23,sratex:3},
  SBK:{drate:16.25,dratex:1.5,gdpi:1,srate:25,sratex:3},
  SC2:{drate:40,dratex:0,gdpi:0,srate:40,sratex:0},
  SC3:{drate:60,dratex:0,gdpi:0,srate:60,sratex:0},
  STR:{drate:22.75,dratex:1.5,gdpi:2,srate:35,sratex:3},
  TSU:{drate:16.25,dratex:1.5,gdpi:0.75,srate:25,sratex:3},
  WAI:{drate:16.25,dratex:1,gdpi:1,srate:25,sratex:1.5},
  WCO:{drate:19.5,dratex:1,gdpi:1,srate:30,sratex:1.5},
  WED:{drate:16.25,dratex:1,gdpi:1,srate:25,sratex:5},
  WEDO:{drate:16.25,dratex:1,gdpi:3.32,srate:25,sratex:5},
  WHR:{drate:26,dratex:1,gdpi:1,srate:40,sratex:1.5},
  WLO:{drate:40,dratex:1,gdpi:5,srate:60,sratex:1.5},
  WLY:{drate:23,dratex:1.5,gdpi:1,srate:38,sratex:1.5},
  WPO:{drate:16.25,dratex:1,gdpi:1,srate:25,sratex:1.5},
  WPU:{drate:9.75,dratex:1.5,gdpi:1,srate:15,sratex:1.5},
  WST:{drate:24.7,dratex:1.5,gdpi:2,srate:38,sratex:1.5},
  WBR:{drate:30,dratex:1.5,gdpi:2,srate:40,sratex:1.5},
  WPH:{drate:15,dratex:1,gdpi:0.75,srate:20,sratex:1},
};

export default async (req) => {
  const store = getStore('flower-rates');

  if (req.method === 'GET') {
    try {
      const stored = await store.get('rates', { type: 'json' });
      return json(stored || DEFAULT_RATES);
    } catch(e) {
      return json(DEFAULT_RATES);
    }
  }

  if (req.method === 'PUT') {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }
    await store.setJSON('rates', body);
    return json(body);
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch(e) { return json({ error: 'Invalid JSON' }, 400); }
    const { zone, ...updates } = body;
    if (!zone) return json({ error: 'zone required' }, 400);
    let current;
    try { current = await store.get('rates', { type: 'json' }) || DEFAULT_RATES; }
    catch(e) { current = { ...DEFAULT_RATES }; }
    current[zone] = { ...current[zone], ...updates };
    await store.setJSON('rates', current);
    return json(current[zone]);
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/rates' };
