import { pool as newPool } from "workerpool";
import type { WorkerPoolOptions } from "workerpool";

/** create pool of web workers for parallel, off-main-thread processing */
export const getPool = <API extends Record<string, (...args: any[]) => any>>(
  script: string,
  options: WorkerPoolOptions = {},
) => {
  /** create pool */
  const pool = newPool(script, {
    /** https://github.com/josdejong/workerpool/issues/341#issuecomment-2046514842 */
    workerOpts: { type: import.meta.env.PROD ? undefined : "module" },
    ...options,
  });

  /** run func */
  const run = <
    Name extends Extract<keyof API, string> = Extract<keyof API, string>,
    Func extends API[Name] = API[Name],
    Params extends Parameters<Func> = Parameters<Func>,
  >(
    name: Name,
    ...params: Params
  ) => pool.exec<Func>(name, params);

  /** remove pool */
  const cleanup = () => pool.terminate(true, 0);

  return { run, cleanup };
};
