import { BANK } from "@/lib/coach/bank";
import { drillStates, listStories } from "@/lib/repo/coach";

/** The numbers on the coach tabs (saved stories, drill cards due), the same on all four tabs. */
export function coachCounts(now = Date.now()) {
  const states = drillStates();
  return {
    stories: listStories().length,
    drill: BANK.filter((q) => q.type === "technical" && Date.parse(states.get(q.id)?.due_at ?? "") <= now).length,
  };
}
