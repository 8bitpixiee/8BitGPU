// runs setup once per isolate and retries if it blew up.
// If the request that started setup is cancelled (client hangs up mid cold start), its promise never
// settles. Waiting on it forever wedges every later request in the isolate, so waiters give up after
// waitMs, drop the stuck promise and start setup again. Setup has to be safe to run twice.
export function once(setup, waitMs = 4000) {
  let done = false;
  let pending = null;
  return async (db) => {
    while (!done) {
      if (!pending) {
        const run = setup(db).then(() => {
          done = true;
        });
        const clear = () => {
          if (pending === run) pending = null;
        };
        run.then(clear, clear);
        pending = run;
      }
      const current = pending;
      let timer;
      const late = new Promise((resolve) => (timer = setTimeout(resolve, waitMs, "late")));
      try {
        if ((await Promise.race([current, late])) === "late" && pending === current) pending = null;
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
