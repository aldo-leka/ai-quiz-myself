import Timer from "@/components/quiz/Timer";

export interface QuestionProps {
    remainingTime?: number
    question: string
    options: string[]
    answer: string
    handleAnswerSelect: (selectedIndex: number) => void
    lockAnswer: boolean
}

export default function Question({ remainingTime, question, options, answer, handleAnswerSelect, lockAnswer }: QuestionProps) {
    return (
        <div className="space-y-6">
            <Timer remainingTime={remainingTime} />

            <div className="p-6 bg-white shadow-sm rounded-lg border border-gray-100">
                <h2 className="text-xl font-semibold mb-6">{question}</h2>

                <div className="space-y-3">
                    {options.map((option, index) => (
                        <button
                            key={index}
                            onClick={() => handleAnswerSelect(index)}
                            disabled={lockAnswer}
                            className={`w-full p-4 text-left rounded-lg transition-colors ${answer === option
                                ? 'bg-blue-100 border-2 border-blue-500'
                                : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'}
                                    ${answer !== "" && answer !== option ? 'opacity-60' : ''}`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}