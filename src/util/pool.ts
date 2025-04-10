import type { Endpoint, Remote } from "comlink";
import { releaseProxy, wrap } from "comlink";
import { clamp } from "lodash";

/** type of vite worker import */
type Worker = { new (): Endpoint };

/** simple pool of web workers */
export const getPool = <API extends Record<string, (...args: any[]) => any>>(
  Worker: Worker,
  maxThreads?: number,
) => {
  /** one worker thread */
  type Thread = { worker: Remote<API>; running: boolean };

  /** max number of threads in pool */
  maxThreads ??= Math.floor(navigator.hardwareConcurrency / 2);
  maxThreads = clamp(maxThreads, 1, 100);

  /** pool */
  let pool: Thread[] = [];

  /** create new threads */
  const reset = () =>
    (pool = new Array(maxThreads)
      .fill(null)
      .map(() => ({ worker: wrap<API>(new Worker()), running: false })));

  reset();

  /** find first free thread */
  const getFree = () => pool.find(({ running }) => !running);

  /** event bus for signalling thread is newly free */
  const newFree = eventBus();

  /** run method in worker */
  const run = async <Type>(method: (worker: Remote<API>) => Promise<Type>) => {
    /** see if any threads are already free */
    let free = getFree();

    /** if not, wait until one becomes free */
    while (!free) {
      await new Promise(newFree.on);
      free = getFree();
    }

    /** run method */
    free.running = true;
    const result = await method(free.worker);
    free.running = false;

    /** signal that new thread is free */
    newFree.emit();

    return result;
  };

  /** free memory */
  const cleanup = () => {
    pool.forEach((proxy) => proxy.worker[releaseProxy]());
    reset();
  };

  return { run, cleanup };
};

type Listener = (...args: any[]) => void;

/** simple single-track, one-time event bus */
const eventBus = () => {
  /** registered listeners */
  const listeners = new Set<Listener>();
  /** register event listener */
  const on = (listener: Listener) => listeners.add(listener);
  /** trigger event */
  const emit = () => {
    /** call */
    listeners.forEach((listener) => listener());
    /** clear */
    listeners.clear();
  };
  return { on, emit };
};
