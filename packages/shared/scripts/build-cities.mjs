// Regenerates src/cities.data.ts from Israeli government open data (data.gov.il):
//   - Localities with Hebrew/English names and ITM coordinates (Central Bureau of Statistics locality codes).
//   - Residents per locality (Population and Immigration Authority), used only to rank search results.
// Run: npm run cities:update -w @weloot/shared   (then review the diff and run the shared tests)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://data.gov.il/api/3/action/datastore_search';
const LOCALITIES = 'e9701dcb-9f1c-43bb-bd44-eb380ade542f'; // "יישובים בשפות עברית, אנגלית, ערבית, רוסית"
const POPULATION = '64edd0ee-3d5d-43ce-8562-c336c24dbc1f'; // "אוכלוסייה לפי יישובים וגילאים"
const OUT = fileURLToPath(new URL('../src/cities.data.ts', import.meta.url));

// English names: the source uses strict CBS transliteration ("Petah Tiqwa"), cuts names at 20 characters and has
// one wrong name. Larger places get the spelling people know; search matches both (see cities.ts).
const ENGLISH_OVERRIDES = {
  1200: "Modi'in-Maccabim-Re'ut",
  8300: 'Rishon LeZion',
  7900: 'Petah Tikva',
  6100: 'Bnei Brak',
  7100: 'Ashkelon',
  6400: 'Herzliya',
  6900: 'Kfar Saba',
  2640: 'Rosh HaAyin',
  9100: 'Nahariya',
  9700: 'Hod HaSharon',
  2600: 'Eilat',
  6300: 'Givatayim',
  7600: 'Acre',
  1139: 'Karmiel',
  2650: 'Ramat HaSharon',
  1309: 'Elad',
  7200: 'Ness Ziona',
  31: 'Ofakim',
  1031: 'Sderot',
  8000: 'Safed',
  3616: "Ma'ale Adumim",
  2530: "Be'er Ya'akov",
  2100: 'Tirat Carmel',
  9400: 'Yehud-Monosson',
  681: "Giv'at Shmuel",
  874: 'Migdal HaEmek',
  1015: 'Mevaseret Zion',
  1020: 'Or Akiva',
  240: "Yokne'am Illit",
  9300: "Zichron Ya'akov",
  229: 'Ganei Tikva',
  3730: "Giv'at Ze'ev",
};
const ENGLISH_OVERRIDES_BY_HEBREW = {
  'אשדות יעקב (מאוחד)': "Ashdot Ya'aqov (Me'uhad)",
  'בית יצחק-שער חפר': "Bet Yizhaq-Sha'ar Hefer",
  'גבעת חיים (מאוחד)': "Giv'at Hayyim (Me'uhad)",
  "כעביה-טבאש-חג'אג'רה": "Ka'abiyye-Tabbash-Hajajre",
  'כפר רוזנואלד (זרעית)': "Kefar Rozenwald (Zar'it)",
  'ניצנה (קהילת חינוך)': 'Nizzana (Qehilat Hinukh)',
  'עין כרם-בי"ס חקלאי': 'En Karem (Agricultural School)',
  'צוקי ים': 'Zuqi Yam',
};

async function fetchAll(resourceId) {
  const res = await fetch(`${API}?resource_id=${resourceId}&limit=10000`);
  if (!res.ok) throw new Error(`data.gov.il ${resourceId}: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(`data.gov.il ${resourceId}: request failed`);
  return json.result.records;
}

/**
 * Israeli Transverse Mercator (EPSG:2039, GRS80) → latitude/longitude. The ~tens-of-meters datum difference to
 * WGS84 is irrelevant at city level (we round to ~100 m and geohash at ~5 km).
 */
function itmToLatLng(x, y) {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 1.0000067;
  const lat0 = ((31 + 44 / 60 + 3.817 / 3600) * Math.PI) / 180;
  const lon0 = ((35 + 12 / 60 + 16.261 / 3600) * Math.PI) / 180;
  const FE = 219529.584;
  const FN = 626907.39;
  const e2 = 2 * f - f * f;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const ep2 = e2 / (1 - e2);
  const meridian = (phi) =>
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));
  const M = meridian(lat0) + (y - FN) / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const C1 = ep2 * cos1 * cos1;
  const T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
  const R1 = (a * (1 - e2)) / (1 - e2 * sin1 * sin1) ** 1.5;
  const D = (x - FE) / (N1 * k0);
  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      cos1;
  return { lat: (lat * 180) / Math.PI, lng: (lon * 180) / Math.PI };
}

/** "QIRYAT TIV'ON" → "Qiryat Tiv'on", "TEL AVIV - YAFO" → "Tel Aviv - Yafo". */
function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-(/])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
    .replace(/\bQiryat\b/g, 'Kiryat');
}

const clean = (s) =>
  String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ');
const round3 = (n) => Math.round(n * 1000) / 1000;

const [localities, population] = await Promise.all([fetchAll(LOCALITIES), fetchAll(POPULATION)]);
const residents = new Map(
  population.map((r) => [String(Number(r['סמל_ישוב'])), Number(r['סהכ']) || 0]),
);

const skipped = [];
const cities = [];
for (const r of localities) {
  const code = String(Number(r.symbol_number));
  const he = clean(r.name_in_hebrew);
  const x = Number(r.X);
  const y = Number(r.Y);
  if (!code || code === '0' || !he || !x || !y) {
    skipped.push(`${code} ${he}`);
    continue;
  }
  const { lat, lng } = itmToLatLng(x, y);
  if (lat < 29 || lat > 34 || lng < 34 || lng > 36)
    throw new Error(`${code} ${he}: outside Israel (${lat}, ${lng})`);
  const en =
    ENGLISH_OVERRIDES[code] ??
    ENGLISH_OVERRIDES_BY_HEBREW[he] ??
    titleCase(clean(r.name_in_english));
  cities.push({
    code,
    he,
    en,
    lat: round3(lat),
    lng: round3(lng),
    residents: residents.get(code) ?? 0,
  });
}

// Most residents first: search keeps this order within each match tier.
cities.sort((a, b) => b.residents - a.residents || a.he.localeCompare(b.he, 'he'));

const rows = cities.map(
  (c) =>
    `  [${JSON.stringify(c.code)}, ${JSON.stringify(c.he)}, ${JSON.stringify(c.en)}, ${c.lat}, ${c.lng}],`,
);
writeFileSync(
  OUT,
  `// GENERATED by scripts/build-cities.mjs from data.gov.il (Central Bureau of Statistics locality list and
// Population Authority residents per locality). Do not edit by hand; fix the script and re-run it.
// Row: [locality code, Hebrew name, English name, latitude, longitude], most residents first.

export const CITY_ROWS: readonly (readonly [string, string, string, number, number])[] = [
${rows.join('\n')}
];
`,
);
console.log(
  `Wrote ${cities.length} localities to ${OUT}; skipped ${skipped.length} without coordinates:`,
);
console.log(skipped.join(', '));
