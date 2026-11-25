// The saver behind useAutosave: latest value wins, one save at a time. Pure (no React), so it has a test.

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export function createSaveQueue<T>(save: (v: T) => Promise<{ ok: boolean }>, onStatus: (s: SaveStatus) => void) {
  let pending: { v: T } | null = null;
  let inflight = 0;
  let tail: Promise<boolean> = Promise.resolve(true);

  const one = async (): Promise<boolean> => {
    const job = pending;
    if (!job) return true;
    pending = null;
    onStatus("saving");
    try {
      if (!(await save(job.v)).ok) throw new Error("save failed");
      onStatus(pending ? "pending" : "saved");
      return true;
    } catch {
      // Retry sends this value again, unless a newer one arrived while it was failing.
      pending ??= job;
      onStatus("error");
      return false;
    }
  };

  return {
    /** Remember the value to save next. */
    set(v: T) {
      pending = { v };
      onStatus("pending");
    },
    /** Save what is waiting, after any save already running. Resolves false when that save failed. */
    flush(): Promise<boolean> {
      inflight++;
      tail = tail.then(one).finally(() => {
        inflight--;
      });
      return tail;
    },
    /** Something is not on the server yet. */
    dirty: () => pending !== null || inflight > 0,
  };
}
