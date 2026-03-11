import { MONEY_LADDER, formatMoney } from "@/lib/quiz-constants";

const WELCOME_TEMPLATES = [
  "We welcome today {name} to the QuizPlus hot seat.",
  "A warm welcome to {name}, ready to chase the million.",
  "Please welcome {name}. The ladder is lit and the pressure is on.",
  "Tonight, the spotlight belongs to {name}.",
  "Here comes {name}, fourteen questions away from the jackpot.",
  "All eyes on {name}. It is time to play QuizPlus: Millionaire.",
] as const;

const QUESTION_INTRO_TEMPLATES = [
  "For {moneyValue}, here comes question {questionNumber}.",
  "Question {questionNumber} is worth {moneyValue}.",
  "Let us climb for {moneyValue}. Here is question {questionNumber}.",
  "This next step is worth {moneyValue}. Listen carefully.",
  "Question {questionNumber} for {moneyValue}.",
  "The ladder moves to {moneyValue}. Here is your next question.",
] as const;

const FIFTY_FIFTY_TEMPLATES = [
  "Fifty fifty is in play. Two answers disappear.",
  "The board narrows now. You are down to two choices.",
  "Fifty fifty played. Only two answers remain.",
  "Two wrong answers are gone. The pressure sharpens.",
] as const;

const FINAL_LOCK_TEMPLATES = [
  "That answer is locked in.",
  "You have made your choice. It is locked.",
  "Final answer locked. No turning back now.",
  "The answer is sealed in.",
  "Locked in. This is the moment.",
] as const;

const CORRECT_REVEAL_TEMPLATES = [
  "That is absolutely correct.",
  "Correct answer. The climb continues.",
  "Yes. You are right and still alive in this game.",
  "Correct. Another step up the ladder.",
  "That is the one. Well played.",
] as const;

const WRONG_REVEAL_TEMPLATES = [
  "That is not correct.",
  "I am sorry, that is the wrong answer.",
  "No, that is not the one we needed.",
  "That answer does not hold. The game stops here.",
  "Not this time. That answer is wrong.",
] as const;

const TIMEOUT_TEMPLATES = [
  "Time is up.",
  "The clock has beaten you there.",
  "That is the buzzer. Time has run out.",
  "No answer before the clock. Time is up.",
] as const;

const ASK_HOST_FALLBACK_TEMPLATES = [
  "My instinct leans toward {guess}.",
  "If I had to lean one way, I would go with {guess}.",
  "I would shade toward {guess}, but it is still your call.",
  "My best hunch is {guess}.",
] as const;

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, value),
    template,
  );
}

function hashSeed(seed: string): number {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickTemplate<T extends readonly string[]>(templates: T, seed: string): T[number] {
  return templates[hashSeed(seed) % templates.length] ?? templates[0];
}

export function buildWelcomeScript(params: {
  contestantName: string;
  seed: string;
}): string {
  return interpolate(pickTemplate(WELCOME_TEMPLATES, params.seed), {
    name: params.contestantName,
  });
}

export function buildQuestionIntroScript(params: {
  questionNumber: number;
  moneyValue: number;
  seed: string;
}): string {
  return interpolate(pickTemplate(QUESTION_INTRO_TEMPLATES, params.seed), {
    moneyValue: formatMoney(params.moneyValue),
    questionNumber: params.questionNumber.toString(),
  });
}

export function buildFiftyFiftyScript(seed: string): string {
  return pickTemplate(FIFTY_FIFTY_TEMPLATES, seed);
}

export function buildFinalLockScript(seed: string): string {
  return pickTemplate(FINAL_LOCK_TEMPLATES, seed);
}

export function buildCorrectRevealScript(params: {
  moneyValue: number;
  seed: string;
}): string {
  return `${pickTemplate(CORRECT_REVEAL_TEMPLATES, params.seed)} ${formatMoney(params.moneyValue)} is secure for now.`;
}

export function buildWrongRevealScript(seed: string): string {
  return pickTemplate(WRONG_REVEAL_TEMPLATES, seed);
}

export function buildTimeoutScript(seed: string): string {
  return pickTemplate(TIMEOUT_TEMPLATES, seed);
}

export function buildAskHostFallbackScript(params: {
  guess: string;
  seed: string;
}): string {
  return interpolate(pickTemplate(ASK_HOST_FALLBACK_TEMPLATES, params.seed), {
    guess: params.guess,
  });
}

export function getWwtbamHostPrewarmTexts(): string[] {
  const texts = new Set<string>();

  for (const template of WELCOME_TEMPLATES) {
    texts.add(interpolate(template, { name: "Contestant" }));
  }

  for (const template of QUESTION_INTRO_TEMPLATES) {
    for (let index = 0; index < MONEY_LADDER.length; index += 1) {
      texts.add(
        interpolate(template, {
          moneyValue: formatMoney(MONEY_LADDER[index] ?? 0),
          questionNumber: (index + 1).toString(),
        }),
      );
    }
  }

  for (const template of FIFTY_FIFTY_TEMPLATES) texts.add(template);
  for (const template of FINAL_LOCK_TEMPLATES) texts.add(template);
  for (const template of WRONG_REVEAL_TEMPLATES) texts.add(template);
  for (const template of TIMEOUT_TEMPLATES) texts.add(template);

  for (const template of CORRECT_REVEAL_TEMPLATES) {
    for (const amount of MONEY_LADDER) {
      texts.add(`${template} ${formatMoney(amount)} is secure for now.`);
    }
  }

  for (const template of ASK_HOST_FALLBACK_TEMPLATES) {
    for (const guess of ["A", "B", "C", "D"]) {
      texts.add(interpolate(template, { guess }));
    }
  }

  return [...texts];
}
