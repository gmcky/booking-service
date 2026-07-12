// Portrait pool for avatarUrl. ~60% of hosts/guests get one (see hosts.ts /
// guests.ts) — the rest stay null so the UI's initials fallback also gets
// exercised, matching how real users behave (not everyone uploads a photo).
// All URLs verified live (HTTP 200) against images.unsplash.com.

const p = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=256&h=256&q=80`;

export const AVATARS = [
  "1438761681033-6461ffad8d80",
  "1489424731084-a5d8b219a5bb",
  "1489980557514-251d61e3eeb6",
  "1494790108377-be9c29b29330",
  "1499996860823-5214fcc65f8f",
  "1500648767791-00dcc994a43e",
  "1500917293891-ef795e70e1f6",
  "1502031882019-24c0bccfffc6",
  "1502685104226-ee32379fefbe",
  "1503185912284-5271ff81b9a8",
  "1503443207922-dff7d543fd0e",
  "1506794778202-cad84cf45f1d",
  "1507003211169-0a1dd7228f2d",
  "1508214751196-bcfd4ca60f91",
  "1508341591423-4347099e1f19",
  "1517070208541-6ddc4d3efbcb",
  "1517841905240-472988babdf9",
  "1519085360753-af0119f7cbe7",
  "1519345182560-3f2917c472ef",
  "1519638399535-1b036603ac77",
  "1519699047748-de8e457a634e",
  "1520466809213-7b9a56adcd45",
  "1520813792240-56fc4a3765a7",
  "1522075469751-3a6694fb2f61",
  "1524253482453-3fed8d2fe12b",
  "1524504388940-b1c1722653e1",
  "1524638431109-93d95c968f03",
  "1531123897727-8f129e1688ce",
  "1531384441138-2736e62e0919",
  "1533227268428-f9ed0900fb3b",
  "1541823709867-1b206113eafd",
  "1544005313-94ddf0286df2",
  "1544168190-79c17527004f",
  "1544717305-2782549b5136",
  "1544725176-7c40e5a71c5e",
  "1548142813-c348350df52b",
  "1552058544-f2b08422138a",
  "1552374196-1ab2a1c593e8",
  "1560250097-0b93528c311a",
  "1567532939604-b6b5b0db2604",
  "1573497019940-1c28c88b4f3e",
  "1580489944761-15a19d654956",
  "1595152772835-219674b2a8a6",
  "1600180758890-6b94519a8ba6",
  "1601288496920-b6154fe3626a",
  "1601412436009-d964bd02edbc",
  "1607346256330-dee7af15f7c5",
  "1607746882042-944635dfe10e",
  "1607990281513-2c110a25bd8c",
  "1614283233556-f35b0c801ef1",
  "1614644147798-f8c0fc9da7f6",
  "1615109398623-88346a601842",
  "1618077360395-f3068be8e001",
  "1633332755192-727a05c4013d",
].map(p);

/**
 * Deterministic ~60% avatar coverage: index 0/1/2 of every group of 5 get a
 * photo, 3/4 stay null. `poolOffset` staggers the draw per user group so
 * hosts and guests don't collide on the same portraits.
 */
export function maybeAvatar(indexInGroup: number, poolOffset: number): string | undefined {
  if (indexInGroup % 5 >= 3) return undefined;
  return AVATARS[(indexInGroup + poolOffset) % AVATARS.length];
}
