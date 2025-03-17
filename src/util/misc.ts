/** map of string hash to numeric id */
const store: Record<string, number> = {};

/** current id */
let id = 1;

/** get stable, incrementing id, unique to passed data */
export const getId = (data: unknown) => {
  const hash = JSON.stringify(data);
  return store[hash] ?? (store[hash] = id++);
};

export const sleep = (ms = 0) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));
