/**
 * Built-in sports cover images schools can choose from (served from
 * public/covers). Stored on a campaign as the `src` path. Schools can
 * also upload their own; these are the curated, sports-related options.
 */
export interface CoverOption {
  src: string;
  label: string;
}

export const COVER_GALLERY: CoverOption[] = [
  { src: "/covers/basketball.jpg", label: "Basketball" },
  { src: "/covers/archery.jpg", label: "Archery" },
  { src: "/covers/softball.jpg", label: "Baseball & Softball" },
];
