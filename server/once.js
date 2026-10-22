// runs setup once per isolate and retries if it blew up
export function once(setup) {
  let ready = null;
  return db => ready ??= setup(db).catch(error => { ready = null; throw error; });
}
