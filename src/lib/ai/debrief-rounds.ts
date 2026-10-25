// Debrief vocabulary, apart from the AI code so client components can import it. Pure.
export const DEBRIEF_ROUNDS = ["phone", "hr", "technical", "case", "onsite", "final"] as const;
export type DebriefRound = (typeof DEBRIEF_ROUNDS)[number];
export const RATINGS = ["red", "yellow", "green"] as const;
export type Rating = (typeof RATINGS)[number];
