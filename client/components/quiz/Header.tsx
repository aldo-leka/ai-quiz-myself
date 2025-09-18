import {AnimatedScore} from "@/components/AnimatedScore";

export interface HeaderProps {
    phase: string
    currentQuestion: number
    totalQuestions: number
    theme: string
    difficulty: string
    score: number
}

export default function Header({ phase, currentQuestion, totalQuestions, theme, difficulty, score }: HeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-6">
            <div className="flex flex-wrap items-center gap-2">
                {phase !== "leaderboard" && (
                    <div className="text-sm font-medium text-gray-500">
                        Question {currentQuestion + 1}/{totalQuestions}
                    </div>
                )}
                {phase === "leaderboard" && (
                    <div className="text-xl font-semibold">Leaderboard</div>
                )}
                <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {theme}
                </div>
                <div className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                    {difficulty}
                </div>
            </div>
            <div className="flex items-center min-w-[100px] justify-center px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                            <span className="text-xs font-medium text-amber-700 mr-2">
                                {phase === "leaderboard" ? "YOUR SCORE" : "SCORE"}
                            </span>
                <AnimatedScore score={score} className="text-amber-600" />
            </div>
        </div>
    )
}