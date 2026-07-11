// ISO 3166-1 alpha-2 codes; English names come from Intl at module load, so
// there's no 250-line name table to keep in sync.
// prettier-ignore
const ISO_COUNTRY_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR",
  "BS","BT","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM",
  "CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ",
  "EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB",
  "GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GT","GU","GW",
  "GY","HK","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS",
  "IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY",
  "KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD",
  "ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU",
  "MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR",
  "NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT",
  "PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH",
  "SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TC",
  "TD","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA",
  "UG","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","YE","YT",
  "ZA","ZM","ZW",
];

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

export const COUNTRIES: string[] = ISO_COUNTRY_CODES.map((code) => displayNames.of(code) ?? code)
  .filter((name, i, all) => all.indexOf(name) === i)
  .sort((a, b) => a.localeCompare(b));

/** Prefix matches rank before substring matches: "United S" → United States. */
export function matchCountries(query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = COUNTRIES.filter((c) => c.toLowerCase().startsWith(q));
  const contains = COUNTRIES.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}
