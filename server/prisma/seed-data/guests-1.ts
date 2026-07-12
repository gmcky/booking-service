import type { SeedGuest } from "./types.js";
import { maybeAvatar } from "./avatars.js";

// Guests 1/2.
const raw: Omit<SeedGuest, "avatarUrl">[] = [
  { email: "liam.murphy@seedguest.dev", firstName: "Liam", lastName: "Murphy", createdMonthsAgo: 14 },
  { email: "chloe.martin@seedguest.dev", firstName: "Chloe", lastName: "Martin", createdMonthsAgo: 8 },
  { email: "noah.bennett@seedguest.dev", firstName: "Noah", lastName: "Bennett", createdMonthsAgo: 22 },
  { email: "emma.wilson@seedguest.dev", firstName: "Emma", lastName: "Wilson", createdMonthsAgo: 6 },
  { email: "lucas.moreau@seedguest.dev", firstName: "Lucas", lastName: "Moreau", createdMonthsAgo: 30 },
  { email: "mia.rossi@seedguest.dev", firstName: "Mia", lastName: "Rossi", createdMonthsAgo: 11 },
  { email: "ethan.clark@seedguest.dev", firstName: "Ethan", lastName: "Clark", createdMonthsAgo: 19 },
  { email: "sophia.keller@seedguest.dev", firstName: "Sophia", lastName: "Keller", createdMonthsAgo: 9 },
  { email: "mateus.oliveira@seedguest.dev", firstName: "Mateus", lastName: "Oliveira", createdMonthsAgo: 27 },
  { email: "ana.pereira@seedguest.dev", firstName: "Ana", lastName: "Pereira", createdMonthsAgo: 15 },
  { email: "jakub.wojcik@seedguest.dev", firstName: "Jakub", lastName: "Wojcik", createdMonthsAgo: 7 },
  { email: "veronika.novakova@seedguest.dev", firstName: "Veronika", lastName: "Novakova", createdMonthsAgo: 33 },
  { email: "stefan.muller@seedguest.dev", firstName: "Stefan", lastName: "Muller", createdMonthsAgo: 12 },
  { email: "laura.fischer@seedguest.dev", firstName: "Laura", lastName: "Fischer", createdMonthsAgo: 20 },
  { email: "daniel.costa@seedguest.dev", firstName: "Daniel", lastName: "Costa", createdMonthsAgo: 6 },
  { email: "beatriz.alves@seedguest.dev", firstName: "Beatriz", lastName: "Alves", createdMonthsAgo: 24 },
  { email: "gabriel.dias@seedguest.dev", firstName: "Gabriel", lastName: "Dias", createdMonthsAgo: 10 },
  { email: "victoria.smirnova@seedguest.dev", firstName: "Victoria", lastName: "Smirnova", createdMonthsAgo: 18 },
  { email: "ahmed.karimi@seedguest.dev", firstName: "Ahmed", lastName: "Karimi", createdMonthsAgo: 29 },
  { email: "layla.hussein@seedguest.dev", firstName: "Layla", lastName: "Hussein", createdMonthsAgo: 13 },
];

export const guests1: SeedGuest[] = raw.map((g, i) => ({
  ...g,
  avatarUrl: maybeAvatar(i, 45),
}));
