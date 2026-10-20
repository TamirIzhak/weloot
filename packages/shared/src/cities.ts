import { encodeGeohash } from './geo';

// Israeli cities users can pick as their location (PRD W1). City-center coordinates, rounded: users are placed
// at city level only, never at a home address (PRD §12). Extend this list as needed; ids are stable keys
// stored on profiles and listings, so never rename an existing id.

export type City = {
  id: string;
  he: string;
  en: string;
  lat: number;
  lng: number;
};

export const CITIES: readonly City[] = [
  { id: 'jerusalem', he: 'ירושלים', en: 'Jerusalem', lat: 31.768, lng: 35.214 },
  { id: 'tel-aviv', he: 'תל אביב-יפו', en: 'Tel Aviv-Yafo', lat: 32.085, lng: 34.782 },
  { id: 'haifa', he: 'חיפה', en: 'Haifa', lat: 32.794, lng: 34.99 },
  { id: 'rishon-lezion', he: 'ראשון לציון', en: 'Rishon LeZion', lat: 31.973, lng: 34.793 },
  { id: 'petah-tikva', he: 'פתח תקווה', en: 'Petah Tikva', lat: 32.084, lng: 34.888 },
  { id: 'ashdod', he: 'אשדוד', en: 'Ashdod', lat: 31.801, lng: 34.644 },
  { id: 'netanya', he: 'נתניה', en: 'Netanya', lat: 32.322, lng: 34.853 },
  { id: 'beer-sheva', he: 'באר שבע', en: 'Beer Sheva', lat: 31.252, lng: 34.791 },
  { id: 'holon', he: 'חולון', en: 'Holon', lat: 32.016, lng: 34.787 },
  { id: 'bnei-brak', he: 'בני ברק', en: 'Bnei Brak', lat: 32.081, lng: 34.834 },
  { id: 'ramat-gan', he: 'רמת גן', en: 'Ramat Gan', lat: 32.068, lng: 34.825 },
  { id: 'rehovot', he: 'רחובות', en: 'Rehovot', lat: 31.893, lng: 34.811 },
  { id: 'bat-yam', he: 'בת ים', en: 'Bat Yam', lat: 32.017, lng: 34.745 },
  { id: 'ashkelon', he: 'אשקלון', en: 'Ashkelon', lat: 31.669, lng: 34.574 },
  { id: 'herzliya', he: 'הרצליה', en: 'Herzliya', lat: 32.166, lng: 34.844 },
  { id: 'kfar-saba', he: 'כפר סבא', en: 'Kfar Saba', lat: 32.175, lng: 34.907 },
  { id: 'modiin', he: 'מודיעין-מכבים-רעות', en: "Modi'in", lat: 31.898, lng: 35.01 },
  { id: 'hadera', he: 'חדרה', en: 'Hadera', lat: 32.434, lng: 34.92 },
  { id: 'raanana', he: 'רעננה', en: "Ra'anana", lat: 32.185, lng: 34.871 },
  { id: 'lod', he: 'לוד', en: 'Lod', lat: 31.951, lng: 34.888 },
  { id: 'ramla', he: 'רמלה', en: 'Ramla', lat: 31.929, lng: 34.866 },
  { id: 'nazareth', he: 'נצרת', en: 'Nazareth', lat: 32.7, lng: 35.304 },
  { id: 'beit-shemesh', he: 'בית שמש', en: 'Beit Shemesh', lat: 31.747, lng: 34.988 },
  { id: 'hod-hasharon', he: 'הוד השרון', en: 'Hod HaSharon', lat: 32.15, lng: 34.892 },
  { id: 'givatayim', he: 'גבעתיים', en: 'Givatayim', lat: 32.072, lng: 34.813 },
  { id: 'kiryat-gat', he: 'קריית גת', en: 'Kiryat Gat', lat: 31.61, lng: 34.764 },
  { id: 'nahariya', he: 'נהריה', en: 'Nahariya', lat: 33.006, lng: 35.098 },
  { id: 'afula', he: 'עפולה', en: 'Afula', lat: 32.608, lng: 35.288 },
  { id: 'eilat', he: 'אילת', en: 'Eilat', lat: 29.558, lng: 34.952 },
  { id: 'kiryat-ata', he: 'קריית אתא', en: 'Kiryat Ata', lat: 32.809, lng: 35.106 },
  { id: 'akko', he: 'עכו', en: 'Acre', lat: 32.928, lng: 35.082 },
  { id: 'karmiel', he: 'כרמיאל', en: 'Karmiel', lat: 32.919, lng: 35.295 },
  { id: 'tiberias', he: 'טבריה', en: 'Tiberias', lat: 32.796, lng: 35.531 },
  { id: 'or-yehuda', he: 'אור יהודה', en: 'Or Yehuda', lat: 32.03, lng: 34.856 },
  { id: 'rosh-haayin', he: 'ראש העין', en: 'Rosh HaAyin', lat: 32.096, lng: 34.957 },
  { id: 'yavne', he: 'יבנה', en: 'Yavne', lat: 31.878, lng: 34.739 },
  { id: 'kiryat-ono', he: 'קריית אונו', en: 'Kiryat Ono', lat: 32.064, lng: 34.855 },
  { id: 'ness-ziona', he: 'נס ציונה', en: 'Ness Ziona', lat: 31.929, lng: 34.799 },
  { id: 'kiryat-motzkin', he: 'קריית מוצקין', en: 'Kiryat Motzkin', lat: 32.837, lng: 35.077 },
  { id: 'kiryat-bialik', he: 'קריית ביאליק', en: 'Kiryat Bialik', lat: 32.828, lng: 35.085 },
  { id: 'kiryat-yam', he: 'קריית ים', en: 'Kiryat Yam', lat: 32.849, lng: 35.069 },
  { id: 'nesher', he: 'נשר', en: 'Nesher', lat: 32.766, lng: 35.044 },
  { id: 'yokneam', he: 'יקנעם עילית', en: 'Yokneam', lat: 32.659, lng: 35.11 },
  { id: 'zichron-yaakov', he: 'זכרון יעקב', en: "Zichron Ya'akov", lat: 32.571, lng: 34.953 },
  { id: 'or-akiva', he: 'אור עקיבא', en: 'Or Akiva', lat: 32.507, lng: 34.92 },
  { id: 'pardes-hanna', he: 'פרדס חנה-כרכור', en: 'Pardes Hanna-Karkur', lat: 32.471, lng: 34.97 },
  { id: 'binyamina', he: 'בנימינה-גבעת עדה', en: 'Binyamina', lat: 32.523, lng: 34.95 },
  { id: 'caesarea', he: 'קיסריה', en: 'Caesarea', lat: 32.5, lng: 34.89 },
  { id: 'tirat-carmel', he: 'טירת כרמל', en: 'Tirat Carmel', lat: 32.76, lng: 34.971 },
  { id: 'sderot', he: 'שדרות', en: 'Sderot', lat: 31.525, lng: 34.596 },
  { id: 'netivot', he: 'נתיבות', en: 'Netivot', lat: 31.423, lng: 34.589 },
  { id: 'ofakim', he: 'אופקים', en: 'Ofakim', lat: 31.314, lng: 34.62 },
  { id: 'dimona', he: 'דימונה', en: 'Dimona', lat: 31.07, lng: 35.033 },
  { id: 'arad', he: 'ערד', en: 'Arad', lat: 31.258, lng: 35.212 },
  { id: 'kiryat-shmona', he: 'קריית שמונה', en: 'Kiryat Shmona', lat: 33.207, lng: 35.57 },
  { id: 'safed', he: 'צפת', en: 'Safed', lat: 32.965, lng: 35.496 },
  { id: 'maalot-tarshiha', he: 'מעלות-תרשיחא', en: "Ma'alot-Tarshiha", lat: 33.017, lng: 35.271 },
  { id: 'migdal-haemek', he: 'מגדל העמק', en: 'Migdal HaEmek', lat: 32.675, lng: 35.241 },
  { id: 'beit-shean', he: 'בית שאן', en: "Beit She'an", lat: 32.497, lng: 35.497 },
  { id: 'yehud', he: 'יהוד-מונוסון', en: 'Yehud', lat: 32.033, lng: 34.89 },
  { id: 'shoham', he: 'שוהם', en: 'Shoham', lat: 31.999, lng: 34.946 },
  { id: 'gedera', he: 'גדרה', en: 'Gedera', lat: 31.812, lng: 34.779 },
  { id: 'mevaseret-zion', he: 'מבשרת ציון', en: 'Mevaseret Zion', lat: 31.8, lng: 35.15 },
  { id: 'maale-adumim', he: 'מעלה אדומים', en: "Ma'ale Adumim", lat: 31.777, lng: 35.298 },
  { id: 'ariel', he: 'אריאל', en: 'Ariel', lat: 32.106, lng: 35.175 },
  { id: 'umm-al-fahm', he: 'אום אל-פחם', en: 'Umm al-Fahm', lat: 32.519, lng: 35.153 },
  { id: 'sakhnin', he: "סח'נין", en: 'Sakhnin', lat: 32.864, lng: 35.297 },
  { id: 'tayibe', he: 'טייבה', en: 'Tayibe', lat: 32.266, lng: 35.009 },
  { id: 'rahat', he: 'רהט', en: 'Rahat', lat: 31.393, lng: 34.754 },
  { id: 'kfar-yona', he: 'כפר יונה', en: 'Kfar Yona', lat: 32.317, lng: 34.935 },
  { id: 'even-yehuda', he: 'אבן יהודה', en: 'Even Yehuda', lat: 32.27, lng: 34.887 },
  { id: 'tel-mond', he: 'תל מונד', en: 'Tel Mond', lat: 32.256, lng: 34.918 },
  { id: 'ramat-hasharon', he: 'רמת השרון', en: 'Ramat HaSharon', lat: 32.146, lng: 34.839 },
  { id: 'kiryat-malakhi', he: 'קריית מלאכי', en: 'Kiryat Malakhi', lat: 31.732, lng: 34.745 },
  { id: 'yeruham', he: 'ירוחם', en: 'Yeruham', lat: 30.987, lng: 34.929 },
  { id: 'mitzpe-ramon', he: 'מצפה רמון', en: 'Mitzpe Ramon', lat: 30.61, lng: 34.801 },
];

const BY_ID = new Map(CITIES.map((city) => [city.id, city]));

export function findCity(id: string): City | undefined {
  return BY_ID.get(id);
}

/** The city-level `geo` stored on profiles and listings (PRD §8). */
export function cityGeo(city: City): { lat: number; lng: number; geohash: string } {
  return { lat: city.lat, lng: city.lng, geohash: encodeGeohash(city.lat, city.lng) };
}

/**
 * Cities matching a search, in the given language's alphabetical order. Matches either language, ignoring case,
 * punctuation and spaces (e.g. "raanana" finds Ra'anana, "קרית" finds קריית).
 */
export function searchCities(query: string, language: 'en' | 'he'): City[] {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s'"׳״\-–.]/g, '')
      .replace(/יי/g, 'י');
  const q = normalize(query);
  const collator = new Intl.Collator(language === 'he' ? 'he' : 'en');
  return CITIES.filter(
    (c) => q === '' || normalize(c.en).includes(q) || normalize(c.he).includes(q),
  ).sort((a, b) => collator.compare(a[language], b[language]));
}
