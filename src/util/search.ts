import { map, range } from "lodash";
import stringComparison from "string-comparison";
import { worker } from "workerpool";

export type Match = {
  text: string;
  search: string;
  score: number;
  start: number;
  end: number;
};

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
  searches: (readonly [string, number])[],
  exact = true,
) => {
  /** collect match results */
  let matches: Match[] = [];

  /** split text into separate words */
  const words = splitWords(text);

  /** for each word */
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    /** for each search term */
    for (const [search, window] of searches) {
      /** window sizes to check */
      const windows = range(1, window + 1);

      /** for each window size */
      for (const window of windows) {
        /** if window extends beyond end, ignore */
        if (wordIndex + window > words.length) continue;

        /** get sliding window of words */
        const windowWords = words.slice(wordIndex, wordIndex + window);
        /** get window text */
        const text = map(windowWords, "text").join(" ");
        /** get range */
        const start = windowWords.at(0)?.start ?? 0;
        const end = windowWords.at(-1)?.end ?? 0;

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

  /** put highest matches first (orderBy not memory-efficient-enough here) */
  matches.sort((a, b) => b.score - a.score);
  /** hard limit matches to avoid crashing web worker */
  matches = matches.slice(0, 1000);

  return matches;
};

worker({ getMatches });
