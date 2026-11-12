/**
 * Smarter catalogue matching for the campaign catalogue picker.
 *
 * Plain substring search misses obvious intent — e.g. "gym equipment" never
 * matches "Weight Training" or an "Olympic Barbell". This adds two things:
 *   1. multi-word matching — every meaningful word in the query must match
 *      (word order / spacing no longer matters), ignoring generic filler;
 *   2. a curated synonym map — lay terms expand to the words that actually
 *      appear in product names/categories (gym → weight, dumbbell, …).
 *
 * No dependencies; purely client-side over the already-loaded catalogue.
 * >>> To tune results, edit SYNONYMS below. <<<
 */

// Generic words we don't require the product to contain (query-side only).
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "with", "in", "on",
  "equipment", "gear", "stuff", "item", "items", "sport", "sports", "school",
  "kids", "kit", "set", "pack", "some", "any", "my", "our",
]);

// Lay term -> words that actually appear in Hart product names/categories.
// Keys are matched as whole query words AND as the whole query phrase.
const SYNONYMS: Record<string, string[]> = {
  gym: ["weight", "dumbbell", "barbell", "kettlebell", "bench", "fitness", "conditioning", "strength", "medicine ball", "plyo", "mat"],
  fitness: ["weight", "dumbbell", "kettlebell", "conditioning", "cardio", "agility", "skipping", "exercise", "resistance", "strength"],
  workout: ["weight", "dumbbell", "kettlebell", "conditioning", "exercise", "resistance"],
  exercise: ["weight", "fitness", "conditioning", "mat", "resistance"],
  strength: ["weight", "dumbbell", "barbell", "kettlebell", "resistance"],
  cardio: ["skipping", "agility", "conditioning", "step"],
  weights: ["weight", "dumbbell", "barbell", "kettlebell", "plate"],
  weight: ["dumbbell", "barbell", "kettlebell", "plate"],
  footy: ["afl", "football", "aussie rules"],
  "aussie rules": ["afl", "football"],
  soccer: ["football", "futsal"],
  football: ["afl", "soccer", "rugby", "touch"],
  medical: ["first aid", "bandage", "ice", "dressing"],
  "first aid": ["bandage", "ice", "dressing", "medical"],
  bibs: ["bib", "vest", "sash", "pinnie"],
  pinnies: ["bib", "vest"],
  markers: ["cone", "marker", "witches hat", "spot"],
  cones: ["cone", "marker", "spot", "disc"],
  balls: ["ball"],
  goals: ["goal", "net", "post"],
  nets: ["net", "goal", "post"],
  racket: ["racquet", "tennis", "badminton", "squash"],
  racquet: ["tennis", "badminton", "squash", "pickleball"],
  mats: ["mat", "tumbling", "gym mat"],
  shade: ["shade", "shelter", "gazebo", "marquee", "tent"],
  tent: ["shade", "shelter", "gazebo", "marquee"],
  marquee: ["shade", "shelter", "gazebo"],
  timer: ["stopwatch", "timing", "timer"],
  stopwatch: ["timing", "timer"],
  swimming: ["swim", "kickboard", "pool", "aqua", "water polo"],
  pool: ["swim", "kickboard", "aqua", "water polo"],
  aquatic: ["swim", "kickboard", "pool", "aqua", "water polo"],
  hurdles: ["hurdle"],
  skipping: ["rope", "skipping"],
  whistle: ["whistle", "lanyard"],
  storage: ["bag", "crate", "trolley", "cart", "rack"],
  bags: ["bag", "crate", "carry"],
};

/** Simple plural -> singular fallback so "nets" matches "net". */
function singular(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Does the haystack satisfy a single query token (itself, singular, or a synonym)? */
function tokenMatches(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true;
  const sing = singular(token);
  if (sing !== token && haystack.includes(sing)) return true;
  const syns = SYNONYMS[token] ?? SYNONYMS[sing];
  return Boolean(syns && syns.some((s) => haystack.includes(s)));
}

/**
 * True if `haystack` (product name + category + sku + description, lower-cased
 * by the caller or here) matches the user's `query`.
 */
export function matchesCatalogue(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const h = haystack.toLowerCase();

  // 1. exact phrase still wins
  if (h.includes(q)) return true;

  // 2. whole-phrase synonyms (e.g. "gym equipment" keyed as "gym equipment")
  const phraseSyns = SYNONYMS[q];
  if (phraseSyns && phraseSyns.some((s) => h.includes(s))) return true;

  // 3. every meaningful word must be satisfied (itself / singular / synonym)
  const tokens = q
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  if (tokens.length === 0) {
    // query was all filler (e.g. "equipment") — fall back to phrase synonyms only
    return false;
  }
  return tokens.every((t) => tokenMatches(h, t));
}
