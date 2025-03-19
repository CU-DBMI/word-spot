export const sleep = (ms = 0) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export const pairs = <Type>(values: Type[]) => {
  const pairs: [Type, Type][] = [];
  for (let index = 0; index < values.length - 1; index++)
    pairs.push(values.slice(index, index + 2) as [Type, Type]);
  return pairs;
};
