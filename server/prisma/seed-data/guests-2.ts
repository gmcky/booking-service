import type { SeedGuest } from "./types.js";
import { maybeAvatar } from "./avatars.js";

// Guests 2/2.
const raw: Omit<SeedGuest, "avatarUrl">[] = [
  { email: "ravi.patel@seedguest.dev", firstName: "Ravi", lastName: "Patel", createdMonthsAgo: 16 },
  { email: "meera.nair@seedguest.dev", firstName: "Meera", lastName: "Nair", createdMonthsAgo: 9 },
  { email: "haruki.suzuki@seedguest.dev", firstName: "Haruki", lastName: "Suzuki", createdMonthsAgo: 25 },
  { email: "yuna.kim@seedguest.dev", firstName: "Yuna", lastName: "Kim", createdMonthsAgo: 7 },
  { email: "wei.lin@seedguest.dev", firstName: "Wei", lastName: "Lin", createdMonthsAgo: 32 },
  { email: "mei.chen@seedguest.dev", firstName: "Mei", lastName: "Chen", createdMonthsAgo: 14 },
  { email: "arjun.reddy@seedguest.dev", firstName: "Arjun", lastName: "Reddy", createdMonthsAgo: 21 },
  { email: "nina.suryani@seedguest.dev", firstName: "Nina", lastName: "Suryani", createdMonthsAgo: 6 },
  { email: "ben.robinson@seedguest.dev", firstName: "Ben", lastName: "Robinson", createdMonthsAgo: 28 },
  { email: "grace.turner@seedguest.dev", firstName: "Grace", lastName: "Turner", createdMonthsAgo: 11 },
  { email: "jack.mitchell@seedguest.dev", firstName: "Jack", lastName: "Mitchell", createdMonthsAgo: 17 },
  { email: "ella.watson@seedguest.dev", firstName: "Ella", lastName: "Watson", createdMonthsAgo: 23 },
  { email: "diego.ramirez@seedguest.dev", firstName: "Diego", lastName: "Ramirez", createdMonthsAgo: 8 },
  { email: "camila.torres@seedguest.dev", firstName: "Camila", lastName: "Torres", createdMonthsAgo: 31 },
  { email: "mateo.gutierrez@seedguest.dev", firstName: "Mateo", lastName: "Gutierrez", createdMonthsAgo: 12 },
  { email: "isabella.flores@seedguest.dev", firstName: "Isabella", lastName: "Flores", createdMonthsAgo: 19 },
  { email: "lucas.silva@seedguest.dev", firstName: "Lucas", lastName: "Silva", createdMonthsAgo: 6 },
  { email: "julia.santos@seedguest.dev", firstName: "Julia", lastName: "Santos", createdMonthsAgo: 26 },
  { email: "connor.byrne@seedguest.dev", firstName: "Connor", lastName: "Byrne", createdMonthsAgo: 10 },
  { email: "amelia.hughes@seedguest.dev", firstName: "Amelia", lastName: "Hughes", createdMonthsAgo: 34 },
];

export const guests2: SeedGuest[] = raw.map((g, i) => ({
  ...g,
  avatarUrl: maybeAvatar(g.firstName, i),
}));
