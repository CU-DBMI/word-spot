import damerauLevenshtein from "damerau-levenshtein";
import { map } from "lodash";

/** reference:
 * https://freedium.cfd/https://marian-caikovski.medium.com/fuzzy-search-for-keywords-in-free-text-f732ecdc9519
 * https://github.com/marianc000/HighlightingFuzzySearchResults
 **/

/** split text into words */
export const splitWords = (text: string) =>
  [...text.matchAll(/[\p{L}\p{N}-]+/dgu)].map((match) => ({
    word: match[0],
    start: match.indices?.[0]?.[0] ?? 0,
    end: match.indices?.[0]?.[1] ?? 0,
  }));

/** map [0,∞] to [1,0] */
const decay = (steps: number, base = 1.5) => base ** -steps;

/** compare free text against list of search phrases */
export const fuzzySearch = (
  text: string,
  searches: string[],
  wordWindow = 3,
  threshold = 0.5
) => {
  /** normalize strings for comparison */
  text = text.toLowerCase();
  searches = searches.map((search) => search.toLowerCase());

  /** collect match results */
  let matches: {
    text: string;
    search: string;
    score: number;
    start: number;
    end: number;
  }[] = [];

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
      const text = map(windowWords, "word").join(" ");
      /** get range */
      const start = windowWords.at(0)?.start ?? 0;
      const end = windowWords.at(-1)?.end ?? 0;

      /** for each search term */
      for (const search of searches) {
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

  return matches;
};
