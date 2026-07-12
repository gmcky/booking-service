import { hosts1 } from "./hosts-1.js";
import { hosts2 } from "./hosts-2.js";
import { hosts3 } from "./hosts-3.js";
import { guests1 } from "./guests-1.js";
import { guests2 } from "./guests-2.js";

import { kyivProperties } from "./cities/kyiv.js";
import { lvivProperties } from "./cities/lviv.js";
import { odesaProperties } from "./cities/odesa.js";
import { berlinProperties } from "./cities/berlin.js";
import { parisProperties } from "./cities/paris.js";
import { romeProperties } from "./cities/rome.js";
import { amsterdamProperties } from "./cities/amsterdam.js";
import { barcelonaProperties } from "./cities/barcelona.js";
import { lisbonProperties } from "./cities/lisbon.js";
import { portoProperties } from "./cities/porto.js";
import { londonProperties } from "./cities/london.js";
import { pragueProperties } from "./cities/prague.js";
import { viennaProperties } from "./cities/vienna.js";
import { budapestProperties } from "./cities/budapest.js";
import { athensProperties } from "./cities/athens.js";
import { santoriniProperties } from "./cities/santorini.js";
import { dubrovnikProperties } from "./cities/dubrovnik.js";
import { copenhagenProperties } from "./cities/copenhagen.js";
import { tokyoProperties } from "./cities/tokyo.js";
import { kyotoProperties } from "./cities/kyoto.js";
import { bangkokProperties } from "./cities/bangkok.js";
import { singaporeProperties } from "./cities/singapore.js";
import { ubudProperties } from "./cities/ubud.js";
import { seoulProperties } from "./cities/seoul.js";
import { dubaiProperties } from "./cities/dubai.js";
import { istanbulProperties } from "./cities/istanbul.js";
import { newYorkProperties } from "./cities/new-york.js";
import { losAngelesProperties } from "./cities/los-angeles.js";
import { miamiProperties } from "./cities/miami.js";
import { vancouverProperties } from "./cities/vancouver.js";
import { mexicoCityProperties } from "./cities/mexico-city.js";
import { cancunProperties } from "./cities/cancun.js";
import { rioDeJaneiroProperties } from "./cities/rio-de-janeiro.js";
import { buenosAiresProperties } from "./cities/buenos-aires.js";
import { cuscoProperties } from "./cities/cusco.js";
import { sydneyProperties } from "./cities/sydney.js";
import { marrakeshProperties } from "./cities/marrakesh.js";
import { capeTownProperties } from "./cities/cape-town.js";

import { reviews1 } from "./reviews-1.js";
import { reviews2 } from "./reviews-2.js";
import { reviews3 } from "./reviews-3.js";
import { reviews4 } from "./reviews-4.js";
import { reviews5 } from "./reviews-5.js";
import { reviews6 } from "./reviews-6.js";

export { hostReplies } from "./host-replies.js";
export { AVATARS as avatarPool } from "./avatars.js";
export type {
  SeedHost,
  SeedGuest,
  SeedPropertyTemplate,
  SeedReview,
  ReviewBucket,
  HostReplyTemplate,
} from "./types.js";

// Hosts/guests: owner@demo.com and owner2@demo.com (the Ukrainian-21 owners)
// live in seed.ts's own `users` array, not here.
export const allHosts = [...hosts1, ...hosts2, ...hosts3];
export const allGuests = [...guests1, ...guests2];

// Order matters: Kyiv/Lviv/Odesa templates come first, in their original
// seed.ts order, because manual booking-scenario checkpoints index into the
// first 9 created properties.
export const allPropertyTemplates = [
  ...kyivProperties,
  ...lvivProperties,
  ...odesaProperties,
  ...berlinProperties,
  ...parisProperties,
  ...romeProperties,
  ...amsterdamProperties,
  ...barcelonaProperties,
  ...lisbonProperties,
  ...portoProperties,
  ...londonProperties,
  ...pragueProperties,
  ...viennaProperties,
  ...budapestProperties,
  ...athensProperties,
  ...santoriniProperties,
  ...dubrovnikProperties,
  ...copenhagenProperties,
  ...tokyoProperties,
  ...kyotoProperties,
  ...bangkokProperties,
  ...singaporeProperties,
  ...ubudProperties,
  ...seoulProperties,
  ...dubaiProperties,
  ...istanbulProperties,
  ...newYorkProperties,
  ...losAngelesProperties,
  ...miamiProperties,
  ...vancouverProperties,
  ...mexicoCityProperties,
  ...cancunProperties,
  ...rioDeJaneiroProperties,
  ...buenosAiresProperties,
  ...cuscoProperties,
  ...sydneyProperties,
  ...marrakeshProperties,
  ...capeTownProperties,
];

export const allReviews = [
  ...reviews1,
  ...reviews2,
  ...reviews3,
  ...reviews4,
  ...reviews5,
  ...reviews6,
];
