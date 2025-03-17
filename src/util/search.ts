import damerauLevenshtein from "damerau-levenshtein";
import { map } from "lodash";

type Matches = {
  text: string;
  search: string;
  score: number;
  start: number;
  end: number;
}[];

/** get all matches of regex, with indices */
export const matchAll = (regex: string, text: string) =>
  [...text.matchAll(new RegExp(regex, "gud"))].map((match) => ({
    text: match[0],
    start: match.indices?.[0]?.[0] ?? 0,
    end: match.indices?.[0]?.[1] ?? 0,
  }));

/** split text into words */
export const splitWords = (text: string) => matchAll("[\\p{L}\\p{N}-]+", text);

/** map [0,∞] to [1,0] */
const decay = (steps: number, base = 1.5) => base ** -steps;

/**
 * reference:
 * https://freedium.cfd/https://marian-caikovski.medium.com/fuzzy-search-for-keywords-in-free-text-f732ecdc9519
 * https://github.com/marianc000/HighlightingFuzzySearchResults
 */

/** compare free text against list of search phrases */
export const getMatches = (
  text: string,
  searches: string[],
  wordWindow = 1,
  method: "fuzzy" | "exact" = "exact",
  threshold = 0.5,
) => {
  /** normalize strings for comparison */
  text = text.toLowerCase();
  searches = searches.map((search) =>
    search.toLowerCase().replaceAll(/\s+/g, " "),
  );

  /** collect match results */
  let matches: Matches = [];

  /** split paragraph into separate words */
  const words = splitWords(text);

  /** for each word */
  for (let startWord = 0; startWord < words.length; startWord++) {
    /** for each window size */
    for (let windowSize = 1; windowSize <= wordWindow; windowSize++) {
      /** if window extends beyond words, ignore */
      if (startWord + windowSize > words.length) continue;

      /** get sliding window of words */
      const windowWords = words.slice(startWord, startWord + windowSize);
      /** get window text */
      const text = map(windowWords, "text").join(" ");
      /** get range */
      const start = windowWords.at(0)?.start ?? 0;
      const end = windowWords.at(-1)?.end ?? 0;

      /** for each search term */
      for (const search of searches) {
        if (method === "exact") {
          if (text === search) {
            matches.push({
              text,
              search,
              score: 1,
              start,
              end,
            });
          }
        } else {
          /** calculate distance between strings */
          let steps = damerauLevenshtein(text, search).steps;
          /** calculate score */
          const score = decay(steps);
          if (score >= threshold)
            matches.push({
              text,
              search,
              score,
              start,
              end,
            });
        }
      }
    }
  }

  return matches;
};
