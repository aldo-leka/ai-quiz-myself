const QUIZ_MODE_PROMPT_LEADS = {
  single: "You are a senior quiz designer building a fast single-player trivia quiz.",
  wwtbam:
    'You are a senior TV game-show producer building a "Who Wants to Be a Millionaire" style quiz.',
  couch_coop: "You are a senior quiz writer creating a couch co-op trivia round for families.",
} as const;

const QUIZ_MODE_EXTRA_REQUIREMENTS = {
  single: [
    "Keep the pace brisk and varied.",
  ],
  wwtbam: [
    "Questions should feel dramatic and TV-ready.",
    'Question text must contain only the pure question itself, with no host lead-in, no money ladder values, and no phrasing like "For £200" or "Question 3 for $500".',
    "Early questions should feel inviting, while late questions should feel tense, high-stakes, and discriminating.",
  ],
  couch_coop: [
    "Questions should be short enough to read comfortably on a TV.",
    "Avoid joke answers and keep distractors plausible.",
  ],
} as const;

const QUIZ_CORE_REQUIREMENTS = [
  "Family friendly and educational.",
  "Exactly 4 options per question.",
  "Only one correct option.",
  "Question text should be clear, natural, and free of unnecessary filler.",
  "Avoid repetitive phrasing and avoid trick wording.",
] as const;

const QUIZ_COVERAGE_REQUIREMENTS = [
  "Keep subjects varied within the theme.",
  "Do not ask multiple questions that test the same fact, event, person, work, place, or concept from only slightly different angles.",
  "Spread coverage across different subtopics, time periods, people, places, mechanisms, categories, or perspectives within the theme whenever the theme allows it.",
  "If the theme is narrow, vary the angle of questioning across identity, chronology, definition, comparison, cause and effect, significance, geography, or terminology.",
  "Avoid near-duplicate option sets or answer patterns across the quiz.",
] as const;

const QUIZ_OPTION_REQUIREMENTS = [
  "Options should be plausible distractors that trigger discussion.",
  'Avoid giveaway patterns such as "all of the above", "none of the above", joke answers, or one obviously more polished option.',
  "Keep option lengths roughly balanced unless the topic genuinely requires a different length.",
  "Do not make the correct option consistently longer, more specific, or more qualified than the distractors.",
  "At least one incorrect option should usually be similar in length and specificity to the correct option.",
  "Do not make the correct option the only answer with extra qualifiers, dates, parentheses, or unusually precise wording.",
  "Distribute correctOptionIndex across 0, 1, 2, and 3 without obvious patterns or long runs.",
] as const;

const QUIZ_EXPLANATION_REQUIREMENTS = [
  "Each option explanation must be specific to that option.",
  "For the correct option, explain why it is correct with a concrete fact or reasoning step.",
  "For each incorrect option, explain briefly why it is wrong, incomplete, or misleading relative to the question.",
  'Do not use empty explanations like "This is incorrect" or explanations that merely restate the option.',
  "Do not repeat the same explanation pattern across all four options.",
] as const;

const QUIZ_JSON_OUTPUT_SHAPE = [
  "{",
  '  "title": "string",',
  '  "theme": "string",',
  '  "questions": [',
  "    {",
  '      "questionText": "string",',
  '      "options": [',
  '        { "text": "string", "explanation": "string" },',
  '        { "text": "string", "explanation": "string" },',
  '        { "text": "string", "explanation": "string" },',
  '        { "text": "string", "explanation": "string" }',
  "      ],",
  '      "correctOptionIndex": 0,',
  '      "difficulty": "easy|medium|hard",',
  '      "subject": "string"',
  "    }",
  "  ]",
  "}",
] as const;

type QuizPromptGameMode = "single" | "wwtbam" | "couch_coop";
type QuizPromptDifficulty = "easy" | "medium" | "hard" | "mixed" | "escalating";

function buildDifficultyPolicy(
  difficulty: QuizPromptDifficulty,
  questionCount: number,
): string {
  if (difficulty === "easy" || difficulty === "medium" || difficulty === "hard") {
    return `Set every question difficulty to "${difficulty}".`;
  }

  if (difficulty === "mixed") {
    return "Balance difficulty across the quiz with about 1/3 easy, 1/3 medium, and 1/3 hard.";
  }

  const easyCount = Math.max(1, Math.floor(questionCount / 3));
  const mediumCount = Math.max(1, Math.floor(questionCount / 3));
  const hardStart = easyCount + mediumCount + 1;

  return `Difficulty must escalate across the quiz:
- Questions 1-${easyCount}: easy
- Questions ${easyCount + 1}-${easyCount + mediumCount}: medium
- Questions ${hardStart}-${questionCount}: hard`;
}

function buildWwtbamLadderGuidance(questionCount: number): string[] {
  const earlyEnd = Math.min(questionCount, 4);
  const midStart = Math.min(questionCount, earlyEnd + 1);
  const midEnd = Math.min(questionCount, 9);
  const lateStart = Math.min(questionCount, midEnd + 1);
  const lateEnd = Math.max(lateStart, Math.min(questionCount, Math.max(questionCount - 2, lateStart)));
  const finalStart = Math.min(questionCount, lateEnd + 1);

  const lines = [
    "WWTBAM ladder guidance:",
    `- Questions 1-${earlyEnd}: broad, highly accessible general knowledge with clear wording and low ambiguity.`,
  ];

  if (midStart <= midEnd) {
    lines.push(
      `- Questions ${midStart}-${midEnd}: still fair to a broad audience, but require stronger recall, recognition, or light inference.`,
    );
  }

  if (lateStart <= lateEnd) {
    lines.push(
      `- Questions ${lateStart}-${lateEnd}: harder, more specialized, or more reasoning-heavy, but still fair and not obscure for obscurity's sake.`,
    );
  }

  if (finalStart <= questionCount) {
    lines.push(
      `- Questions ${finalStart}-${questionCount}: highest-pressure questions with strong discrimination value; difficult, memorable, and solvable without feeling random.`,
    );
  }

  return lines;
}

function buildSourceGroundingRequirements(): string[] {
  return [
    "Generate questions based on the following source content.",
    "Only use facts that are explicitly stated in the source or directly inferable from it.",
    "Do not introduce outside facts, dates, names, claims, or context that are not supported by the source.",
    "If the source is too thin for a sophisticated question, prefer a simpler but fully supported question instead of inventing detail.",
    "When the source is ambiguous, phrase the question conservatively rather than guessing.",
  ];
}

export function createQuizGenerationPrompt(input: {
  theme: string;
  gameMode: QuizPromptGameMode;
  difficulty: QuizPromptDifficulty;
  questionCount: number;
  existingQuestions?: string[];
  sourceText?: string;
}): string {
  const existingQuestions = (input.existingQuestions ?? [])
    .map((question) => question.trim())
    .filter((question) => question.length > 0)
    .slice(0, 80);
  const sourceText = input.sourceText?.trim() ?? "";
  const lines = [
    QUIZ_MODE_PROMPT_LEADS[input.gameMode],
    "",
    `Create one polished quiz with exactly ${input.questionCount} multiple-choice questions for the theme: ${input.theme}.`,
    "",
    "Core requirements:",
    ...QUIZ_CORE_REQUIREMENTS.map((requirement) => `- ${requirement}`),
    ...QUIZ_MODE_EXTRA_REQUIREMENTS[input.gameMode].map((requirement) => `- ${requirement}`),
    `- ${buildDifficultyPolicy(input.difficulty, input.questionCount)}`,
  ];

  lines.push(
    "",
    "Coverage requirements:",
    ...QUIZ_COVERAGE_REQUIREMENTS.map((requirement) => `- ${requirement}`),
    "",
    "Option-writing requirements:",
    ...QUIZ_OPTION_REQUIREMENTS.map((requirement) => `- ${requirement}`),
    "",
    "Explanation requirements:",
    ...QUIZ_EXPLANATION_REQUIREMENTS.map((requirement) => `- ${requirement}`),
  );

  if (input.gameMode === "wwtbam") {
    lines.push(
      "",
      ...buildWwtbamLadderGuidance(input.questionCount),
    );
  }

  if (sourceText.length > 0) {
    lines.push(
      "",
      ...buildSourceGroundingRequirements(),
      "",
      sourceText,
    );
  }

  if (existingQuestions.length > 0) {
    lines.push(
      "",
      "The following questions already exist for this topic. Do NOT repeat, rephrase, or create variations of any of them:",
      ...existingQuestions.map((question, index) => `${index + 1}. ${question}`),
    );
  }

  lines.push(
    "",
    "Return ONLY valid JSON matching this shape:",
    ...QUIZ_JSON_OUTPUT_SHAPE,
  );

  return lines.join("\n");
}

export function createWwtbamHostHintsPrompt(params: {
  title: string;
  theme: string;
  questions: Array<{
    position: number;
    questionText: string;
    options: Array<{ text: string }>;
  }>;
}): string {
  return [
    "You are writing precomputed 'Ask the Host' hints for a quiz show.",
    "For each question, act like a knowledgeable but imperfect quiz-show host.",
    "Choose the option you would lean toward based on general knowledge and the option wording alone, then give brief reasoning.",
    "Rules:",
    "- Return one hint for every question.",
    "- guessedOptionIndex must reference the original option order (0=A, 1=B, 2=C, 3=D).",
    "- reasoning must be 1 or 2 short sentences.",
    "- Do not mention option letters.",
    "- Do not mention option text verbatim.",
    "- Do not say 'I'd lean' or 'I would choose'.",
    "- Do not mention money values, host phrases, or game-show framing.",
    "- Do not act like you are certain unless the question is obviously easy.",
    "- Do not use hidden metadata, explanations, or answer-key style reasoning.",
    "- Sound like an informed hunch, not a guaranteed solve.",
    "",
    `Quiz title: ${params.title}`,
    `Theme: ${params.theme}`,
    "",
    "Questions:",
    ...params.questions.flatMap((question) => [
      `Question ${question.position}: ${question.questionText}`,
      ...question.options.map(
        (option, optionIndex) => `Option ${optionIndex}: ${option.text}`,
      ),
      "",
    ]),
  ].join("\n");
}
