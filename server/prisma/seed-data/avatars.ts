// Portrait pools for avatarUrl, split by gender so a portrait always matches
// the user's first name. ~60% of hosts/guests get one (see hosts.ts /
// guests.ts) — the rest stay null so the UI's initials fallback also gets
// exercised, matching how real users behave (not everyone uploads a photo).
// All URLs verified live (HTTP 200) and visually audited via contact sheet
// against images.unsplash.com.

const p = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=256&h=256&q=80`;

const FEMALE_AVATARS = [
  "1438761681033-6461ffad8d80",
  "1489424731084-a5d8b219a5bb",
  "1494790108377-be9c29b29330",
  "1500917293891-ef795e70e1f6",
  "1502031882019-24c0bccfffc6",
  "1502685104226-ee32379fefbe",
  "1503185912284-5271ff81b9a8",
  "1508214751196-bcfd4ca60f91",
  "1517841905240-472988babdf9",
  "1519699047748-de8e457a634e",
  "1520466809213-7b9a56adcd45",
  "1520813792240-56fc4a3765a7",
  "1524504388940-b1c1722653e1",
  "1524638431109-93d95c968f03",
  "1531123897727-8f129e1688ce",
  "1541823709867-1b206113eafd",
  "1544005313-94ddf0286df2",
  "1544717305-2782549b5136",
  "1544725176-7c40e5a71c5e",
  "1548142813-c348350df52b",
  "1567532939604-b6b5b0db2604",
  "1573497019940-1c28c88b4f3e",
  "1580489944761-15a19d654956",
  "1601288496920-b6154fe3626a",
  "1601412436009-d964bd02edbc",
  "1607746882042-944635dfe10e",
  "1614283233556-f35b0c801ef1",
  "1614644147798-f8c0fc9da7f6",
].map(p);

const MALE_AVATARS = [
  "1489980557514-251d61e3eeb6",
  "1499996860823-5214fcc65f8f",
  "1500648767791-00dcc994a43e",
  "1503443207922-dff7d543fd0e",
  "1506794778202-cad84cf45f1d",
  "1507003211169-0a1dd7228f2d",
  "1508341591423-4347099e1f19",
  "1517070208541-6ddc4d3efbcb",
  "1519085360753-af0119f7cbe7",
  "1519345182560-3f2917c472ef",
  "1522075469751-3a6694fb2f61",
  "1531384441138-2736e62e0919",
  "1533227268428-f9ed0900fb3b",
  "1544168190-79c17527004f",
  "1552058544-f2b08422138a",
  "1552374196-1ab2a1c593e8",
  "1560250097-0b93528c311a",
  "1595152772835-219674b2a8a6",
  "1600180758890-6b94519a8ba6",
  "1607346256330-dee7af15f7c5",
  "1607990281513-2c110a25bd8c",
  "1615109398623-88346a601842",
  "1618077360395-f3068be8e001",
  "1633332755192-727a05c4013d",
  "1463453091185-61582044d556",
  "1472099645785-5658abf4ff4e",
  "1500048993953-d23a436266cf",
  "1568602471122-7832951cc4c5",
].map(p);

// Tail entries are reserved for seed.ts's demo accounts; maybeAvatar() never
// draws them for hosts/guests.
const RESERVED = { m: 4, f: 1 } as const;

export const demoAvatars = {
  male: MALE_AVATARS.slice(-RESERVED.m),
  female: FEMALE_AVATARS.slice(-RESERVED.f),
};

type Gender = "m" | "f";

// Every seed first name → gender, so a portrait can't land on a mismatched
// name. maybeAvatar() throws on names missing here.
const NAME_GENDER: Record<string, Gender> = {
  // hosts-1
  Marta: "f",
  Jonas: "m",
  Sofia: "f",
  Diego: "m",
  Elena: "f",
  Tomas: "m",
  Anna: "f",
  Lukas: "m",
  Isabel: "f",
  Pieter: "m",
  Clara: "f",
  Matteo: "m",
  Hannah: "f",
  Ricardo: "m",
  Julia: "f",
  // hosts-2
  Petra: "f",
  Milos: "m",
  Eszter: "f",
  Dimitris: "m",
  Ingrid: "f",
  Amir: "m",
  Yusuf: "m",
  Nadia: "f",
  Omar: "m",
  Thabo: "m",
  Lindiwe: "f",
  Andreas: "m",
  Zofia: "f",
  Erik: "m",
  // hosts-3
  Yuki: "f",
  Haruto: "m",
  Siriporn: "f",
  Wei: "m",
  Made: "m",
  "Ji-woo": "f",
  Michael: "m",
  Amanda: "f",
  Carlos: "m",
  Valentina: "f",
  Santiago: "m",
  Olivia: "f",
  James: "m",
  Priya: "f",
  // guests-1
  Liam: "m",
  Chloe: "f",
  Noah: "m",
  Emma: "f",
  Lucas: "m",
  Mia: "f",
  Ethan: "m",
  Sophia: "f",
  Mateus: "m",
  Ana: "f",
  Jakub: "m",
  Veronika: "f",
  Stefan: "m",
  Laura: "f",
  Daniel: "m",
  Beatriz: "f",
  Gabriel: "m",
  Victoria: "f",
  Ahmed: "m",
  Layla: "f",
  // guests-2
  Ravi: "m",
  Meera: "f",
  Haruki: "m",
  Yuna: "f",
  Mei: "f",
  Arjun: "m",
  Nina: "f",
  Ben: "m",
  Grace: "f",
  Jack: "m",
  Ella: "f",
  Camila: "f",
  Mateo: "m",
  Isabella: "f",
  Connor: "m",
  Amelia: "f",
};

const pools: Record<Gender, string[]> = {
  m: MALE_AVATARS.slice(0, -RESERVED.m),
  f: FEMALE_AVATARS.slice(0, -RESERVED.f),
};
const next: Record<Gender, number> = { m: 0, f: 0 };

/**
 * Deterministic ~60% avatar coverage: index 0/1/2 of every group of 5 get a
 * photo, 3/4 stay null. Each draw takes the next unused portrait from the
 * pool matching the first name's gender. Group files consume in the import
 * order of index.ts, so assignment is stable across runs. Throws instead of
 * wrapping when a pool runs dry — add portraits rather than duplicate them.
 */
export function maybeAvatar(firstName: string, indexInGroup: number): string | undefined {
  if (indexInGroup % 5 >= 3) return undefined;
  const gender = NAME_GENDER[firstName];
  if (!gender) {
    throw new Error(`No NAME_GENDER entry for seed first name "${firstName}" (avatars.ts)`);
  }
  const pool = pools[gender];
  if (next[gender] >= pool.length) {
    throw new Error(`Avatar pool "${gender}" exhausted — add portraits to avatars.ts`);
  }
  return pool[next[gender]++];
}
