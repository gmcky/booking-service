import type { SeedHost } from "./types.js";
import { maybeAvatar } from "./avatars.js";

// Hosts 2/3. Central/Eastern Europe, Mediterranean, Nordics, Middle East.
const raw: Omit<SeedHost, "avatarUrl">[] = [
  {
    email: "petra.horvat@seedhost.dev",
    firstName: "Petra",
    lastName: "Horvat",
    bio: "Grew up sailing this coastline with my dad. Now I rent out the house we used as a base every summer.",
    createdYearsAgo: 3,
  },
  {
    email: "milos.jovanovic@seedhost.dev",
    firstName: "Milos",
    lastName: "Jovanovic",
    bio: "Two apartments, one in the old town and one closer to the water. Both get booked out fast in July.",
    createdYearsAgo: 4,
  },
  {
    email: "eszter.nagy@seedhost.dev",
    firstName: "Eszter",
    lastName: "Nagy",
    bio: "Museum curator during the week, host on the side. I keep a shelf of local guidebooks for guests.",
    createdYearsAgo: 2,
  },
  {
    email: "dimitris.papadopoulos@seedhost.dev",
    firstName: "Dimitris",
    lastName: "Papadopoulos",
    bio: "My family has owned this building for decades. Finally put the top floor to good use.",
    createdYearsAgo: 5,
  },
  {
    email: "ingrid.hansen@seedhost.dev",
    firstName: "Ingrid",
    lastName: "Hansen",
    bio: "Minimalist by nature, my place reflects that. Bikes are in the courtyard, help yourself.",
    createdYearsAgo: 3,
  },
  {
    email: "amir.al-sayed@seedhost.dev",
    firstName: "Amir",
    lastName: "Al-Sayed",
    bio: "Business consultant who travels constantly, so I put my second home to work instead of leaving it empty.",
    createdYearsAgo: 2,
  },
  {
    email: "yusuf.demir@seedhost.dev",
    firstName: "Yusuf",
    lastName: "Demir",
    bio: "I run a small tea shop downstairs. Guests get the first cup on the house.",
    createdYearsAgo: 4,
  },
  {
    email: "nadia.hassan@seedhost.dev",
    firstName: "Nadia",
    lastName: "Hassan",
    bio: "I design the interiors myself, a little different from the usual rental look around here.",
    createdYearsAgo: 1,
  },
  {
    email: "omar.idrissi@seedhost.dev",
    firstName: "Omar",
    lastName: "Idrissi",
    bio: "This riad belonged to my grandfather. Restoring it room by room, still a work in progress.",
    createdYearsAgo: 3,
  },
  {
    email: "thabo.nkosi@seedhost.dev",
    firstName: "Thabo",
    lastName: "Nkosi",
    bio: "Surfer, host, occasional tour guide if you catch me on a slow week.",
    createdYearsAgo: 2,
  },
  {
    email: "lindiwe.dlamini@seedhost.dev",
    firstName: "Lindiwe",
    lastName: "Dlamini",
    bio: "I run three properties across the city with my sister. We split the guest messages evenly.",
    createdYearsAgo: 5,
  },
  {
    email: "andreas.papas@seedhost.dev",
    firstName: "Andreas",
    lastName: "Papas",
    bio: "Semi-retired ferry captain. Long stories about the islands available on request.",
    createdYearsAgo: 6,
  },
  {
    email: "zofia.kaminska@seedhost.dev",
    firstName: "Zofia",
    lastName: "Kaminska",
    bio: "First year hosting, still learning the ropes. Bear with me if something's not perfect yet.",
    createdYearsAgo: 1,
  },
  {
    email: "erik.johansson@seedhost.dev",
    firstName: "Erik",
    lastName: "Johansson",
    bio: "Carpenter by trade. Built most of the furniture in this place myself.",
    createdYearsAgo: 4,
  },
];

export const hosts2: SeedHost[] = raw.map((h, i) => ({
  ...h,
  avatarUrl: maybeAvatar(h.firstName, i),
}));
