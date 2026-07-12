// Property image pool, organized by style category so each listing only
// draws from photos that plausibly match its title/description. All URLs
// verified live (HTTP 200) against images.unsplash.com — see
// check-images.mjs for the liveness checker used during authoring.
//
// Reuse policy: within categories, a given URL may appear in a couple of
// property templates (different cities) — the pool isn't infinite, but
// `pickImages()` cycles with an offset so no single template repeats a
// neighbour's exact set.

const u = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;

/** Direct URL for hand-assigned image sets (e.g. Amsterdam's canal pair). */
export const imageUrl = u;

export const IMAGES = {
  cityApartment: [
    "1560448204-e02f11c3d0e2",
    "1552321554-5fefe8c9ef14",
    "1502602898657-3e91760cbb34",
    "1489171078254-c3365d6e359f",
    "1598928506311-c55ded91a20c",
    "1600210492486-724fe5c67fb0",
    "1444723121867-7a241cacace9",
    "1487958449943-2429e8be8625",
    "1494203484021-3c454daf695d",
    "1560448075-bb485b067938",
    "1502005229762-cf1b2da7c5d6",
    "1560185009-5bf9f2849488",
    "1586023492125-27b2c045efd7",
    "1616486338812-3dadae4b4ace",
    "1556912167-f556f1f39fdf",
    "1484154218962-a197022b5858",
    "1567767292278-a4f21aa2d36e",
    "1583417319070-4a69db38a482",
  ].map(u),
  historicEuropean: [
    "1493809842364-78817add7ffb",
    "1583847268964-b28dc8f51f92",
    "1560185008-b033106af5c3",
    "1522708323590-d24dbb6b0267",
    "1600210491892-03d54c0aaf87",
    "1493663284031-b7e3aefcae8e",
    "1554995207-c18c203602cb",
    "1595526114035-0d45ed16cfbf",
    "1524758631624-e2822e304c36",
    "1615529182904-14819c35db37",
    "1600121848594-d8644e57abab",
    "1600607687939-ce8a6c25118c",
    "1499856871958-5b9627545d1a",
    "1501183638710-841dd1904471",
    "1502672023488-70e25813eb80",
    "1578683010236-d716f9a3f461",
    "1582719478250-c89cae4dc85b",
    "1540518614846-7eded433c457",
    "1615874959474-d609969a20ed",
    "1571939228382-b2f2b585ce15",
  ].map(u),
  beach: [
    "1507525428034-b723cf961d3e",
    "1512917774080-9991f1c4c750",
    "1512918728675-ed5a9ecdebfd",
    "1519046904884-53103b34b206",
    "1520250497591-112f2f40a3f4",
    "1520454974749-611b7248ffdb",
    "1505142468610-359e7d316be0",
    "1506929562872-bb421503ef21",
    "1510414842594-a61c69b5ae57",
    "1471922694854-ff1b63b20054",
    "1509233725247-49e657c54213",
    "1573790387438-4da905039392",
    "1537956965359-7573183d1f57",
  ].map(u),
  villaPool: [
    "1613490493576-7fde63acd811",
    "1571896349842-33c89424de2d",
    "1521783988139-89397d761dce",
    "1522156373667-4c7234bbd804",
    "1522771739844-6a9f6d5f14af",
    "1522798514-97ceb8c4f1c8",
    "1523217582562-09d0def993a6",
    "1613977257592-4871e5fcd7c4",
    "1600596542815-ffad4c1539a9",
    "1602002418082-a4443e081dd1",
    "1551882547-ff40c63fe5fa",
    "1580587771525-78b9dba3b914",
    "1613977257363-707ba9348227",
    "1564013799919-ab600027ffc6",
  ].map(u),
  canalBoat: [
    "1534351590666-13e3e96b5017",
    "1513694203232-719a280e022f",
    "1512470876302-972faa2aa9a4",
    "1567899378494-47b22a2ae96a",
  ].map(u),
  minimalistModern: [
    "1502672260266-1c1ef2d93688",
    "1533090161767-e6ffed986c88",
    "1560185127-6ed189bf02f4",
    "1560185893-a55cbc8c57e8",
    "1600607687644-c7171b42498f",
    "1600585153490-76fb20a32601",
    "1617806118233-18e1de247200",
    "1616594039964-ae9021a400a0",
  ].map(u),
  loftIndustrial: [
    "1549187774-b4e9b0445b41",
    "1461360228754-6e81c478b882",
    "1536376072261-38c75010e6c9",
    "1507842217343-583bb7270b66",
    "1586105251261-72a756497a11",
  ].map(u),
  riadOriental: [
    "1571508601891-ca5e7a713859",
    "1584132915807-fd1f5fbc078f",
    "1584132967334-10e028bd69f7",
    "1489749798305-4fea3ae63d43",
    "1590490360182-c33d57733427",
    "1611892440504-42a792e24d32",
    "1539020140153-e479b8c22e70",
    "1512632578888-169bbbc64f33",
  ].map(u),
  cabinCottage: [
    "1570129477492-45c003edd2be",
    "1568605114967-8130f3a36994",
    "1449158743715-0a90ebb6d2d8",
    "1595877244574-e90ce41ce089",
    "1584622650111-993a426fbf0a",
    "1584622781564-1d987f7333c1",
    "1585544314038-a0d3769d0193",
    "1587061949409-02df41d5e562",
    "1587985064135-0366536eab42",
    "1510798831971-661eb04b3739",
    "1518780664697-55e3ad937233",
    "1542718610-a1d656d1884c",
    "1571055107559-3e67626fa8be",
    "1601918774946-25832a4be0d6",
  ].map(u),
  tropical: [
    "1590073844006-33379778ae09",
    "1592229505726-ca121723b8ef",
    "1594563703937-fdc640497dcd",
    "1595576508898-0ad5c879a061",
    "1600047509807-ba8f99d2cdde",
    "1600210492493-0946911123ea",
    "1600566753086-00f18fb6b3ea",
    "1600566753190-17f0baa2a6c3",
    "1600585154340-be6161a56a0c",
    "1537996194471-e657df975ab4",
    "1518548419970-58e3b4079ab2",
    "1540202404-a2f29016b523",
    "1499793983690-e29da59ef1c2",
    "1540541338287-41700207dee6",
    "1568084680786-a84f91d1153c",
    "1571003123894-1f0594d2b5d9",
    "1555400038-63f5ba517a47",
  ].map(u),
  compactRoom: [
    "1505693416388-ac5ce068fe85",
    "1600607687920-4e2a09cf159d",
    "1615873968403-89e068629265",
    "1618221195710-dd6b41faaea6",
    "1618221469555-7f3ad97540d6",
    "1590490359683-658d3d23f972",
    "1631049307264-da0ec9d70304",
  ].map(u),
} as const;

export type ImageCategory = keyof typeof IMAGES;

/**
 * Deterministically pick `count` images from one or two categories
 * (hero image first, from the primary category).
 *
 * A shared cursor per PRIMARY category hands out consecutive slices, so
 * successive picks — city files import in a fixed order, and a city's
 * listings call this back-to-back — never overlap until the pool wraps.
 * The legacy `offset` argument only seeds the cursor on first use, which
 * keeps the historical assignments stable-ish without allowing two
 * neighbours to collide.
 */
const cursors = new Map<string, number>();

export function pickImages(
  categories: ImageCategory | [ImageCategory, ImageCategory],
  count: number,
  offset = 0,
): string[] {
  const primary = Array.isArray(categories) ? categories[0] : categories;
  const secondary = Array.isArray(categories) ? categories[1] : undefined;
  const pool = secondary
    ? [...IMAGES[primary], ...IMAGES[secondary]]
    : IMAGES[primary];

  const start = cursors.get(primary) ?? offset % pool.length;
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[(start + i) % pool.length]!);
  }
  cursors.set(primary, (start + count) % IMAGES[primary].length);
  return result;
}
