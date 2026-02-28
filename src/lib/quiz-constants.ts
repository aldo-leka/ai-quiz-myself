export const MONEY_LADDER = [
  500,
  1_000,
  2_000,
  3_000,
  5_000,
  7_000,
  10_000,
  20_000,
  30_000,
  50_000,
  100_000,
  250_000,
  500_000,
  1_000_000,
] as const;

export const CHECKPOINTS = [4, 9, 13] as const;
export const QUESTION_LENGTH_SECONDS = 60;

export const LOADING_ACTIONS = [
  "Warming up the spotlight",
  "Cueing dramatic music",
  "Adjusting the lifelines",
  "Counting the prize money",
  "Locking in the final answer",
  "Phoning a friend",
  "Asking the audience",
  "Shuffling the questions",
  "Tightening the host's tie",
  "Building the suspense",
  "Stacking the million",
  "Filling the briefcase",
  "Checking the prize ladder",
  "Securing the jackpot",
  "Polishing the cheque",
  "Printing imaginary money",
  "Lowering the studio hush",
  "Suspense levels rising",
  "Rehearsing the host's lines",
  "Loading studio effects",
] as const;

export const WELCOME_MESSAGES = [
  "Welcome, {{name}}, to the hottest seat on television!|||medium|||You are fourteen questions away from one million dollars.|||fast|||Are you ready to play?",
  "Tonight could change everything, {{name}}.|||slow|||One question at a time, one million at the top.|||medium|||Let's begin.",
  "Welcome to QuizPlus: Millionaire, {{name}}!|||medium|||Keep calm, trust your instincts, and let's climb this ladder.",
] as const;

export const NEXT_QUESTION_MESSAGES = [
  "|||slow|||For ${{moneyValue}}, here is your question: {{question}}|||fast|||A: {{optionA}} |||option:A||||||fast|||B: {{optionB}} |||option:B||||||fast|||C: {{optionC}} |||option:C||||||fast|||D: {{optionD}} |||option:D|||",
  "|||medium|||This one is worth ${{moneyValue}}. {{question}}|||fast|||Is it A: {{optionA}} |||option:A||||||fast|||B: {{optionB}} |||option:B||||||fast|||C: {{optionC}} |||option:C||||||fast|||or D: {{optionD}} |||option:D|||",
] as const;

export const LIFELINE_5050_MESSAGES = [
  "50:50 activated.|||medium|||Two answers are gone. You now have {{option1}} and {{option2}}.",
  "The board narrows now.|||medium|||Your remaining options are {{option1}} and {{option2}}.",
] as const;

export const ASK_HOST_FALLBACK_MESSAGES = [
  "If I had to make the call, I'd lean toward {{guess}}.|||medium|||But this is still your game, and your final answer.",
  "My instinct says {{guess}}.|||slow|||It's the option that fits best from what we know.",
] as const;

export const ANIMATED_TEXT_SPEED_MS = 50;
export const ANIMATED_TEXT_SLOW_PAUSE_MS = 3000;
export const ANIMATED_TEXT_MEDIUM_PAUSE_MS = 1500;
export const ANIMATED_TEXT_FAST_PAUSE_MS = 500;

export function formatMoney(value: number): string {
  return `$${value.toLocaleString()}`;
}
