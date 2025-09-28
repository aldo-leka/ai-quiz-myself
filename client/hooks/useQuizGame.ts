import {useState} from 'react';
import {GlobalGameLeaderboardPlayer} from '@/lib/types';

export type GamePhase = "question" | "explanation" | "leaderboard" | null;

export const useQuizGame = () => {
    const [phase, setPhase] = useState<GamePhase>(null);
    const [theme, setTheme] = useState("");
    const [difficulty, setDifficulty] = useState("");
    const [totalQuestions, setTotalQuestions] = useState(0);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [question, setQuestion] = useState("");
    const [options, setOptions] = useState<string[]>([]);
    const [remainingTime, setRemainingTime] = useState<number>();
    const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number>();
    const [explanation, setExplanation] = useState("");
    const [answer, setAnswer] = useState("");
    const [lockAnswer, setLockAnswer] = useState(false);
    const [score, setScore] = useState(0);
    const [leaderBoard, setLeaderBoard] = useState<GlobalGameLeaderboardPlayer[]>([]);

    const resetGame = () => {
        setPhase(null);
        setScore(0);
        setAnswer("");
        setLockAnswer(false);
    };

    const setQuestionData = (data: {
        theme: string;
        difficulty: string;
        questionIndex: number;
        totalQuestions: number;
        question: string;
        options: string[];
        remainingTime: number;
    }) => {
        setPhase("question");
        setTheme(data.theme);
        setDifficulty(data.difficulty);
        setCurrentQuestion(data.questionIndex);
        setTotalQuestions(data.totalQuestions);
        setQuestion(data.question);
        setOptions(data.options);
        setRemainingTime(data.remainingTime);
        setAnswer("");
        setLockAnswer(false);
    };

    const setExplanationData = (data: {
        theme: string;
        difficulty: string;
        questionIndex: number;
        totalQuestions: number;
        question: string;
        options: string[];
        correctAnswerIndex: number;
        explanation: string;
        remainingTime: number;
    }) => {
        setPhase("explanation");
        setTheme(data.theme);
        setDifficulty(data.difficulty);
        setCurrentQuestion(data.questionIndex);
        setTotalQuestions(data.totalQuestions);
        setQuestion(data.question);
        setOptions(data.options);
        setCorrectAnswerIndex(data.correctAnswerIndex);
        setExplanation(data.explanation);
        setRemainingTime(data.remainingTime);
        setLockAnswer(true);
    };

    return {
        // State
        phase,
        theme,
        difficulty,
        totalQuestions,
        currentQuestion,
        question,
        options,
        remainingTime,
        correctAnswerIndex,
        explanation,
        answer,
        lockAnswer,
        score,
        leaderBoard,

        // Setters
        setPhase,
        setTheme,
        setDifficulty,
        setScore,
        setRemainingTime,
        setCorrectAnswerIndex,
        setExplanation,
        setAnswer,
        setLockAnswer,
        setTotalQuestions,
        setCurrentQuestion,
        setQuestion,
        setOptions,
        setLeaderBoard,

        // Convenience methods
        resetGame,
        setQuestionData,
        setExplanationData
    };
};