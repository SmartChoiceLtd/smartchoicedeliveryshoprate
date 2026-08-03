// suggest-zone.mjs
// Takes a delivery address + shop code, returns the best matching zone code
// Used by the Zoho form to pre-fill the Zone dropdown

const GOOGLE_GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_DISTANCE = 'https://maps.googleapis.com/maps/api/distancematrix/json';

// Haversine distance in km between two lat/lng points
function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// All named out-of-town zones with centre coordinates and match radius
// Ordered from smallest/most specific to largest to avoid false matches
const OUT_OF_TOWN_ZONES = [
  // Immediate Calgary area — west side
  { code:'BAL',  name:'Balzac',            lat:51.2100, lng:-114.0200, radiusKm:3  },
  { code:'TSA',  name:'Tsuu Tina Adjacent',      lat:50.9175, lng:-114.1615, radiusKm:4  },
  { code:'TSU',  name:'Tsuu Tina Nation',  lat:50.9800, lng:-114.2600, radiusKm:4  },
  { code:'BPW',  name:'Bearspaw',          lat:51.1500, lng:-114.3000, radiusKm:8  },
  { code:'SBK',  name:'Springbank',        lat:51.0800, lng:-114.3500, radiusKm:8  },
   { code:'DEW',  name:'DeWinton',          lat:50.8200, lng:-113.9800, radiusKm:6  },
  { code:'HPT',  name:'Heritage Pointe',   lat:50.8500, lng:-113.9500, radiusKm:4  },
  { code:'MDF',  name:'MD Foothills',      lat:50.7500, lng:-114.0000, radiusKm:10 },
  { code:'PRI',  name:'Priddis',           lat:50.8800, lng:-114.3500, radiusKm:6  },
  { code:'BRG',  name:'Bragg Creek',       lat:50.9500, lng:-114.5700, radiusKm:7  },
  { code:'MIL',  name:'Millarville',       lat:50.7567, lng:-114.3194, radiusKm:12  },
  { code:'DVA',  name:'Diamond Valley',     lat:50.6833, lng:-114.2833, radiusKm:10 },
  // South of city — east of Macleod
  { code:'RVS',  name:'Rocky View County', lat:50.9500, lng:-113.8000, radiusKm:12 },
  // Inner ring towns
  { code:'AIR',  name:'Airdrie',           lat:51.2920, lng:-114.0144, radiusKm:8  },
  { code:'CHE',  name:'Chestermere',       lat:51.0487, lng:-113.8225, radiusKm:7  },
  { code:'OKO',  name:'Okotoks',           lat:50.7258, lng:-113.9758, radiusKm:8  },
  { code:'STR',  name:'Strathmore',        lat:51.0378, lng:-113.4003, radiusKm:8  },
  { code:'COC',  name:'Cochrane',          lat:51.1897, lng:-114.4672, radiusKm:9  },
  { code:'LAN',  name:'Langdon',           lat:51.0000, lng:-113.6667, radiusKm:6  },
  { code:'LYA',  name:'Lyalta',            lat:51.1000, lng:-113.5000, radiusKm:6  },
  { code:'CAR',  name:'Carsland',          lat:51.1333, lng:-113.4333, radiusKm:6  },
  { code:'CRO',  name:'Crossfield',        lat:51.4333, lng:-114.0333, radiusKm:7  },
  { code:'HRV',  name:'High River',        lat:50.5808, lng:-113.8747, radiusKm:8  },
  { code:'NAN',  name:'Nanton',            lat:50.3500, lng:-113.7667, radiusKm:8  },
  { code:'BEI',  name:'Beiseker',          lat:51.3833, lng:-113.5333, radiusKm:7  },
  // Western corridor
  { code:'KAN',  name:'Kananaskis',        lat:50.9311, lng:-115.0986, radiusKm:15 },
  { code:'CAN',  name:'Canmore',           lat:51.0894, lng:-115.3582, radiusKm:9  },
  { code:'BNF',  name:'Banff',             lat:51.1784, lng:-115.5708, radiusKm:10 },
  { code:'LKL',  name:'Lake Louise',       lat:51.4254, lng:-116.1773, radiusKm:12 },
];

// Shop lookup table — maps shop codes to lat/lng for distance calculation
// These are approximate centres; the quoting tool has exact geocoded locations
// In production the webhook should look up the shop from the Blobs store
const SHOP_FALLBACK_LAT = 51.0447; // Calgary centre fallback
const SHOP_FALLBACK_LNG = -114.0719;

// Calgary city boundary approximate bounding box (tight)
function isLikelyInCalgary(lat, lng) {
return lat > 50.840 && lat < 51.215 && lng > -114.215 && lng < -113.800;;
}

// Map driving distance (km from shop) to city zone code
function cityZoneForKm(km) {
  if (km <= 8)  return { code:'C1', confidence:'high' };
  if (km <= 13) return { code:'C3', confidence:'high' };
  if (km <= 18) return { code:'C4', confidence:'high' };
  return             { code:'C5', confidence:'high' };
}

async function geocode(address, key) {
  const url = `${GOOGLE_GEOCODE}?address=${encodeURIComponent(address + ', Alberta, Canada')}&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results[0]) return null;
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formatted: r.formatted_address,
    types: r.types || []
  };
}

async function getDrivingKm(originLat, originLng, destLat, destLng, key) {
  const url = `${GOOGLE_DISTANCE}?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=driving&units=metric&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') return null;
  return el.distance.value / 1000;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}
// ERV/EVA split — divided by Hwy 8 (approx lat 51.005, lng range -114.22 to -114.45)
function getElbowZone(lat, lng) {
  // Must be in the Elbow area west of city
  if (lng < -114.22 && lng > -114.50 && lat > 50.96 && lat < 51.06) {
    return lat >= 51.0 ? 'ERV' : 'EVA';
  }
  return null;
}
export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
  }

  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return json({ error: 'GOOGLE_MAPS_KEY not configured.' }, 500);

  const url = new URL(req.url);
  const address = url.searchParams.get('address');
  const shopLat = parseFloat(url.searchParams.get('shop_lat') || SHOP_FALLBACK_LAT);
  const shopLng = parseFloat(url.searchParams.get('shop_lng') || SHOP_FALLBACK_LNG);

  if (!address) return json({ error: 'address parameter required' }, 400);

  // Step 1: geocode
  const geo = await geocode(address, key);
  if (!geo) {
    return json({
      suggested: null,
      confidence: 'unresolvable',
      message: 'Address could not be geocoded. Please select zone manually.',
      address_searched: address
    });
  }

  const { lat, lng, formatted } = geo;
// ERV/EVA boundary check — split by Hwy 8
  const elbowZone = getElbowZone(lat, lng);
  if (elbowZone) {
    return json({
      suggested: elbowZone,
      confidence: 'high',
      message: elbowZone === 'ERV' ? 'Clearwater Park / Elbow River Estates (north of Hwy 8)' : 'Elbow Valley (south of Hwy 8)',
      formatted_address: formatted,
      debug_lat: lat,
      debug_lng: lng
    });
  }
  // Step 2: check named out-of-town zones first (before Calgary check)
  // Check from smallest radius to largest to prefer specific over general
  let bestTown = null;
  let bestDist = Infinity;
  for (const zone of OUT_OF_TOWN_ZONES) {
    const d = haversineKm({ lat, lng }, { lat: zone.lat, lng: zone.lng });
    if (d <= zone.radiusKm && d < bestDist) {
      bestTown = zone;
      bestDist = d;
    }
  }

  if (bestTown) {
    return json({
      suggested: bestTown.code,
      confidence: bestDist < bestTown.radiusKm * 0.6 ? 'high' : 'medium',
      message: `Matched to ${bestTown.name} (${bestTown.code})`,
      formatted_address: formatted,
      distance_to_zone_km: Math.round(bestDist * 10) / 10
    });
  }

  // Step 3: check if inside Calgary
  if (isLikelyInCalgary(lat, lng)) {
    const drivingKm = await getDrivingKm(shopLat, shopLng, lat, lng, key);
    if (drivingKm !== null) {
      const zone = cityZoneForKm(drivingKm);
      return json({
        suggested: zone.code,
        confidence: zone.confidence,
        message: `Calgary delivery — ${drivingKm.toFixed(1)} km driving from shop`,
        formatted_address: formatted,
        driving_km: Math.round(drivingKm * 10) / 10
      });
    } else {
      // Geocoded inside Calgary but distance matrix failed — still suggest C3 as most common
      return json({
        suggested: 'C3',
        confidence: 'low',
        message: 'Address appears to be in Calgary but driving distance could not be calculated. C3 suggested as default — please verify.',
        formatted_address: formatted
      });
    }
   }
  
  // Secondary TSU check — west of Tsuut'ina Trail, north of Hwy 22X
  if (lat > 50.92 && lat < 51.03 && lng < -114.215 && lng > -114.35) {
    return json({ suggested:'TSU', confidence:'medium',
      message:'Address appears to be in Tsuu T\'ina territory (west of Tsuut\'ina Trail)',
      formatted_address: formatted });
  }

  // DEW secondary check — Sirocco/Deer Lake/Spruce Meadows corridor
  if (lat > 50.83 && lat < 50.95 && lng < -114.05 && lng > -114.25) {
    return json({ suggested:'DEW', confidence:'medium',
      message:'Address appears to be in DeWinton/Sirocco corridor',
      formatted_address: formatted });
  }

  // RVS secondary check — east of ~84 Street SW, south of city
  if (lat > 50.85 && lat < 51.00 && lng > -113.95 && lng < -113.80) {
    return json({ suggested:'RVS', confidence:'medium',
      message:'Address appears to be in Rocky View County SE',
      formatted_address: formatted });
  }

  // Step 4: outside Calgary and no named zone match — flag for review

  // Step 4: outside Calgary and no named zone match — flag for review
  // Calculate straight-line distance from shop as a hint
  const straightKm = haversineKm({ lat: shopLat, lng: shopLng }, { lat, lng });
  return json({
    suggested: null,
    confidence: 'manual',
    message: `Address is outside Calgary and did not match a known zone (approx ${Math.round(straightKm)} km from shop). Please select zone manually.`,
    formatted_address: formatted,
    straight_line_km: Math.round(straightKm)
  });
};

export const config = { path: '/api/suggest-zone' };
