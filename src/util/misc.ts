export const sleep = (ms = 0) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

/** turn array into array of adjacent parirs */
export const pairs = <Type>(values: Type[]) => {
  const pairs: [Type, Type][] = [];
  for (let index = 0; index < values.length - 1; index++)
    pairs.push(values.slice(index, index + 2) as [Type, Type]);
  return pairs;
};

/** flag that can be set and automatically gets unset after period of time */
export const flag = (ms = 0) => {
  let flag = false;
  return {
    set: async () => {
      flag = true;
      await sleep(ms);
      flag = false;
    },
    get: () => flag,
  };
};
