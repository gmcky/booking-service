import type { SeedHost } from "./types.js";
import { maybeAvatar } from "./avatars.js";

// Hosts 1/3. Ukraine + Western/Central Europe. owner@demo.com / owner2@demo.com
// stay the Ukrainian-21 owners and live in seed.ts's users array, not here.
const raw: Omit<SeedHost, "avatarUrl">[] = [
  {
    email: "marta.kowalczyk@seedhost.dev",
    firstName: "Marta",
    lastName: "Kowalczyk",
    bio: "Renting out my grandmother's old flat since I moved abroad for work. Still fly back a few times a year to check on it myself.",
    createdYearsAgo: 4,
  },
  {
    email: "jonas.becker@seedhost.dev",
    firstName: "Jonas",
    lastName: "Becker",
    bio: "Architect by trade, host by accident — bought a second unit as an investment and it turned into a small hobby.",
    createdYearsAgo: 3,
  },
  {
    email: "sofia.almeida@seedhost.dev",
    firstName: "Sofia",
    lastName: "Almeida",
    bio: "Born and raised here, I love pointing guests to the spots tourists usually miss.",
    createdYearsAgo: 2,
  },
  {
    email: "diego.fernandez@seedhost.dev",
    firstName: "Diego",
    lastName: "Fernandez",
    bio: "Third generation in this building. My family used to live here before we converted the top floor for guests.",
    createdYearsAgo: 5,
  },
  {
    email: "elena.rossi@seedhost.dev",
    firstName: "Elena",
    lastName: "Rossi",
    bio: "I restore old apartments on the side — this one took almost a year to get right.",
    createdYearsAgo: 3,
  },
  {
    email: "tomas.novak@seedhost.dev",
    firstName: "Tomas",
    lastName: "Novak",
    bio: "Software engineer, host on weekends. Fast responses guaranteed, I basically live on my phone anyway.",
    createdYearsAgo: 2,
  },
  {
    email: "anna.schmidt@seedhost.dev",
    firstName: "Anna",
    lastName: "Schmidt",
    bio: "Retired teacher with too much free time and one very comfortable spare apartment.",
    createdYearsAgo: 6,
  },
  {
    email: "lukas.wagner@seedhost.dev",
    firstName: "Lukas",
    lastName: "Wagner",
    bio: "Run a small chain of guest apartments across two cities — happy to help with anything during your stay.",
    createdYearsAgo: 5,
  },
  {
    email: "isabel.santos@seedhost.dev",
    firstName: "Isabel",
    lastName: "Santos",
    bio: "Left the corporate world two years ago to fix up old flats instead. This one was the first.",
    createdYearsAgo: 2,
  },
  {
    email: "pieter.devries@seedhost.dev",
    firstName: "Pieter",
    lastName: "de Vries",
    bio: "Sailor turned landlord. The boat comes with stories if you ask nicely.",
    createdYearsAgo: 4,
  },
  {
    email: "clara.dubois@seedhost.dev",
    firstName: "Clara",
    lastName: "Dubois",
    bio: "I host between freelance illustration gigs — expect quick replies except during deadline week.",
    createdYearsAgo: 1,
  },
  {
    email: "matteo.greco@seedhost.dev",
    firstName: "Matteo",
    lastName: "Greco",
    bio: "Family-run guesthouse, three generations now. My nonna still insists on choosing the welcome snacks.",
    createdYearsAgo: 6,
  },
  {
    email: "hannah.weiss@seedhost.dev",
    firstName: "Hannah",
    lastName: "Weiss",
    bio: "Photographer who travels a lot, so this place is empty more often than not — book away.",
    createdYearsAgo: 3,
  },
  {
    email: "ricardo.silva@seedhost.dev",
    firstName: "Ricardo",
    lastName: "Silva",
    bio: "Been hosting since before it was trendy. Ask me for restaurant tips, I have strong opinions.",
    createdYearsAgo: 5,
  },
  {
    email: "julia.meyer@seedhost.dev",
    firstName: "Julia",
    lastName: "Meyer",
    bio: "Part-time host, full-time nurse. My schedule is odd but I always answer messages eventually.",
    createdYearsAgo: 2,
  },
];

export const hosts1: SeedHost[] = raw.map((h, i) => ({
  ...h,
  avatarUrl: maybeAvatar(i, 0),
}));
