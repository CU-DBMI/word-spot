import { map, orderBy, range } from "lodash";
import stringComparison from "string-comparison";
import { worker } from "workerpool";

export type Matches = {
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

/** compare free text against list of search phrases */
export const getMatches = (
  text: string,
  searches: string[],
  window = 1,
  exact = true,
) => {
  /** normalize strings for comparison */
  text = text.toLowerCase();
  searches = searches.map((search) =>
    search.toLowerCase().replaceAll(/\s+/g, " "),
  );

  /** collect match results */
  let matches: Matches = [];

  /** split text into separate words */
  const words = splitWords(text);

  /** various window sizes */
  const windows = range(1, window);

  /** for each word */
  for (let startWord = 0; startWord < words.length; startWord++) {
    /** for each window size */
    for (const window of windows) {
      /** if window extends beyond words, ignore */
      if (startWord + window > words.length) continue;

      /** get sliding window of words */
      const windowWords = words.slice(startWord, startWord + window);
      /** get window text */
      const text = map(windowWords, "text").join(" ");
      /** get range */
      const start = windowWords.at(0)?.start ?? 0;
      const end = windowWords.at(-1)?.end ?? 0;

      /** for each search term */
      for (const search of searches) {
        if (exact) {
          if (text === search)
            matches.push({ text, search, score: 1, start, end });
        } else {
          /** calculate distance between strings */
          const steps = stringComparison.levenshtein.distance(text, search);
          /** calculate score */
          const score = decay(steps);
          matches.push({ text, search, score, start, end });
        }
      }
    }
  }
  /** hard limit matches to avoid crashing web worker */
  matches = orderBy(matches, "score", "desc").slice(0, 1000);

  return matches;
};

worker({ getMatches });
