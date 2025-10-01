import { useState } from 'react'
import { SingleGameQuestion } from '@/lib/types'

interface HostCommunicationState {
    isLoading: boolean
    error: boolean
}

interface UseHostCommunicationProps {
    conversationHistory: { role: string; content: string }[]
    setConversationHistory: React.Dispatch<React.SetStateAction<{ role: string; content: string }[]>>
}

export function useHostCommunication({ conversationHistory, setConversationHistory }: UseHostCommunicationProps) {
    const [state, setState] = useState<HostCommunicationState>({
        isLoading: false,
        error: false
    })

    const sendAction = async (
        action: string,
        currentQuestion: SingleGameQuestion,
        currentQuestionIndex: number,
        remainingTime: number | null
    ): Promise<string | null> => {
        setState({ isLoading: true, error: false })

        const moneyLadder = [500, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000, 100000, 250000, 500000, 1000000]

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/host-talk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    history: conversationHistory,
                    currentSetting: {
                        moneyValue: moneyLadder[currentQuestionIndex],
                        remainingTime: remainingTime,
                        difficulty: currentQuestion.difficulty,
                        question: currentQuestion.question,
                        correctAnswer: currentQuestion.correctAnswer,
                        options: currentQuestion.options
                    },
                    action
                })
            })

            if (response.ok) {
                const data = await response.json()

                // Add to conversation history
                setConversationHistory(prev => [...prev,
                    { role: 'player', content: action },
                    { role: 'host', content: data.response }
                ])

                setState({ isLoading: false, error: false })
                return data.response
            } else {
                setState({ isLoading: false, error: true })
                return null
            }
        } catch (error) {
            setState({ isLoading: false, error: true })
            return null
        }
    }

    return {
        sendAction,
        isLoading: state.isLoading,
        error: state.error
    }
}