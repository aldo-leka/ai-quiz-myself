import { useState } from 'react'
import { SingleGameQuestion } from '@/lib/types'
import {MONEY_LADDER} from "@/lib/constants";

interface HostCommunicationState {
    isLoading: boolean
    error: boolean
}

interface UseHostCommunicationProps {
    conversationHistory: { role: string; content: string }[]
    setConversationHistory: React.Dispatch<React.SetStateAction<{ role: string; content: string }[]>>
}

export type HostActionType =
    | 'WELCOME'
    | 'BEGIN_QUESTION'
    | 'NEXT_QUESTION'
    | 'FINAL_ANSWER_CONFIRM'
    | 'TIME_WARNING'
    | 'LIFELINE_5050'
    | 'LIFELINE_ASK_HOST'

interface SendActionParams {
    actionType: HostActionType
    action: string
    currentQuestion?: SingleGameQuestion
    currentQuestionIndex?: number
    remainingTime?: number | null
    additionalData?: {
        selectedAnswer?: string
        remainingOptions?: string[]
        contestantName?: string
        correctAnswerExplanation?: string
        selectedAnswerExplanation?: string
    }
}

export function useHostCommunication({ conversationHistory, setConversationHistory }: UseHostCommunicationProps) {
    const [state, setState] = useState<HostCommunicationState>({
        isLoading: false,
        error: false
    })

    const sendAction = async ({
        actionType,
        action,
        currentQuestion,
        currentQuestionIndex = 0,
        remainingTime = null,
        additionalData = {}
    }: SendActionParams): Promise<string | null> => {
        setState({ isLoading: true, error: false })

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/host`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    history: conversationHistory,
                    currentSetting: currentQuestion ? {
                        moneyValue: MONEY_LADDER[currentQuestionIndex],
                        remainingTime: remainingTime,
                        difficulty: currentQuestion.difficulty,
                        question: currentQuestion.question,
                        correctAnswer: currentQuestion.correctAnswer,
                        options: currentQuestion.options
                    } : { moneyValue: MONEY_LADDER[currentQuestionIndex] },
                    action,
                    actionType,
                    additionalData
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