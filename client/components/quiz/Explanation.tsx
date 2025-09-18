export interface ExplanationProps {
    options: string[]
    question: string
    correctAnswerIndex?: number
    answer: string
    explanation: string
    remainingTime?: number
}

export default function Explanation({ options, question, correctAnswerIndex, answer, explanation, remainingTime } : ExplanationProps) {
    const isCorrect = correctAnswerIndex !== undefined && options[correctAnswerIndex] === answer;

    return (
        <div className="space-y-6">

            <div className="p-6 bg-white shadow-sm rounded-lg border border-gray-100">
                <h2 className="text-xl font-semibold mb-4">{question}</h2>

                <div className="space-y-3 mb-6">
                    {options.map((option, index) => (
                        <div
                            key={index}
                            className={`w-full p-4 text-left rounded-lg ${index === correctAnswerIndex
                                ? 'bg-green-100 border-2 border-green-500'
                                : answer === option && correctAnswerIndex !== undefined && index !== correctAnswerIndex
                                    ? 'bg-red-100 border-2 border-red-500'
                                    : 'bg-gray-50 border border-gray-200'}`}
                        >
                            {option}
                        </div>
                    ))}
                </div>

                <div className={`p-4 rounded-lg mb-4 ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className={`text-lg font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                        {isCorrect ? '✓ Correct!' : '✗ Incorrect!'}
                    </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="text-sm font-semibold text-gray-700 mb-2">Explanation:</div>
                    <div className="text-gray-700">{explanation}</div>
                </div>
            </div>

            <div className="flex justify-center mt-4">
                <div className="text-gray-600">
                    Proceeding to next question in {remainingTime}s...
                </div>
            </div>
        </div>
    )
}