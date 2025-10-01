export interface Player {
    nickname: string,
    country: string
}

export interface GlobalGameStarted {
    theme: string,
    difficulty: string
}

export interface NextGlobalGameQuestionMessage {
    theme: string,
    difficulty: string,
    questionIndex: number,
    totalQuestions: number,
    question: string,
    options: string[],
    remainingTime: number
}

export interface RevealGlobalGameAnswerMessage {
    theme: string,
    difficulty: string,
    questionIndex: number,
    totalQuestions: number,
    question: string,
    options: string[],
    correctAnswerIndex: number,
    explanation: string,
    remainingTime: number
}

export interface UpdateGlobalGameScoreMessage {
    score: number
}

export interface GlobalGameTimerUpdateMessage {
    remainingTime: number
}

export interface GlobalGameOverMessage {
    theme: string,
    difficulty: string,
    leaderboard: GlobalGameLeaderboardPlayer[],
    remainingTime: number
}

export interface GlobalGameLeaderboardPlayer {
    nickname: string,
    country: string,
    score: number
}

export interface SingleGameQuestion {
    question: string
    options: string[]
    correctAnswer: string
    explanations: string[]
    difficulty?: string
    subject?: string
}

export type SinglePlayerGamePhase = "waiting" | "intro" | "question" | "explanation" | "completed";

export interface SinglePlayerGameState {
    // Game session metadata
    gameId: string
    startTime: number
    lastUpdated: number

    // Game configuration
    theme: string
    difficulty: string
    questions: SingleGameQuestion[]

    // Current progress
    phase: SinglePlayerGamePhase
    currentQuestionIndex: number
    score: number

    // Current question state
    selectedAnswer?: string
    isAnswerLocked: boolean
    showingExplanation: boolean

    // Timer state
    remainingTime?: number

    // User answers history
    userAnswers: Array<{
        questionIndex: number
        selectedAnswer: string
        isCorrect: boolean
        timeSpent: number
    }>

    // Intro state
    showIntro: boolean
    introAnimationComplete: boolean
}