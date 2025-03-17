/** https://github.com/tad-lispy/node-damerau-levenshtein/pull/14/files */

declare module "damerau-levenshtein" {
  export default function lev(
    firstString: string,
    secondString: string,
    limit?: number
  ): LevenshteinResponse;
}

interface LevenshteinResponse {
  steps: number;
  relative: number;
  similarity: number;
}
