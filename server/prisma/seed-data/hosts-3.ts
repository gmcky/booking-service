import type { SeedHost } from "./types.js";
import { maybeAvatar } from "./avatars.js";

// Hosts 3/3. Asia, Americas, Australia, plus 2 professional multi-country hosts.
const raw: Omit<SeedHost, "avatarUrl">[] = [
  {
    email: "yuki.tanaka@seedhost.dev",
    firstName: "Yuki",
    lastName: "Tanaka",
    bio: "Third-generation innkeeper family — we just moved part of the business onto platforms like this one.",
    createdYearsAgo: 4,
  },
  {
    email: "haruto.sato@seedhost.dev",
    firstName: "Haruto",
    lastName: "Sato",
    bio: "Tea ceremony instructor on weekends, host the rest of the time. Quiet building, quiet guests preferred.",
    createdYearsAgo: 2,
  },
  {
    email: "siriporn.charoen@seedhost.dev",
    firstName: "Siriporn",
    lastName: "Charoensuk",
    bio: "My mother ran a guesthouse here for twenty years — I took over and added a website, that's about it.",
    createdYearsAgo: 5,
  },
  {
    email: "wei.zhang@seedhost.dev",
    firstName: "Wei",
    lastName: "Zhang",
    bio: "Tech worker with a rental on the side. Smart lock, self check-in, minimal fuss.",
    createdYearsAgo: 2,
  },
  {
    email: "made.wirawan@seedhost.dev",
    firstName: "Made",
    lastName: "Wirawan",
    bio: "Grew up in the rice fields nearby, built this place with my brothers over a couple of years.",
    createdYearsAgo: 3,
  },
  {
    email: "ji-woo.kim@seedhost.dev",
    firstName: "Ji-woo",
    lastName: "Kim",
    bio: "Designed the apartment myself after years of renovation shows — finally got to try it for real.",
    createdYearsAgo: 1,
  },
  {
    email: "michael.chen@seedhost.dev",
    firstName: "Michael",
    lastName: "Chen",
    bio: "Bought this as a rental property years back, been improving it a bit every season since.",
    createdYearsAgo: 6,
  },
  {
    email: "amanda.johnson@seedhost.dev",
    firstName: "Amanda",
    lastName: "Johnson",
    bio: "Interior designer — this listing is basically my portfolio piece at this point.",
    createdYearsAgo: 3,
  },
  {
    email: "carlos.mendoza@seedhost.dev",
    firstName: "Carlos",
    lastName: "Mendoza",
    bio: "Family house turned guest stay after my parents moved out to the coast.",
    createdYearsAgo: 4,
  },
  {
    email: "valentina.rojas@seedhost.dev",
    firstName: "Valentina",
    lastName: "Rojas",
    bio: "Chef who hosts on the side — leave me a note if you want restaurant recommendations, I don't hold back.",
    createdYearsAgo: 2,
  },
  {
    email: "santiago.gomez@seedhost.dev",
    firstName: "Santiago",
    lastName: "Gomez",
    bio: "Mountain guide most of the year, host during the off season.",
    createdYearsAgo: 3,
  },
  {
    email: "olivia.taylor@seedhost.dev",
    firstName: "Olivia",
    lastName: "Taylor",
    bio: "Ex-flight attendant, now firmly grounded and happy to host instead.",
    createdYearsAgo: 2,
  },
  {
    email: "james.oconnor@seedhost.dev",
    firstName: "James",
    lastName: "O'Connor",
    bio: "Run a small portfolio of properties across a few cities — professional setup, always someone reachable.",
    createdYearsAgo: 6,
  },
  {
    email: "priya.sharma@seedhost.dev",
    firstName: "Priya",
    lastName: "Sharma",
    bio: "Manage listings across several countries for a small hospitality group — expect fast, polished service.",
    createdYearsAgo: 5,
  },
];

export const hosts3: SeedHost[] = raw.map((h, i) => ({
  ...h,
  avatarUrl: maybeAvatar(i, 33),
}));
