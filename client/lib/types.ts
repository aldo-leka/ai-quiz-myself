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