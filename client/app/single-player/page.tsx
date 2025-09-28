"use client"

import {useGame} from "@/context/GameContext";
import {useState} from "react";
import NicknamePrompt from "@/components/NicknamePrompt";
import Button from "@/components/Button";
import { User } from "lucide-react";


export default function SinglePlayer() {
    const { state } = useGame()
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null)

    function handleAnswerSelect(selectedIndex: number) {
        setSelectedAnswerIndex(selectedIndex)
    }

    if (!state.isRegistered) {
        return <NicknamePrompt />
    }

    const timePercentage = 80


    return (
        <div className="p-8 mx-auto min-h-screen"
             style={{
                 backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.1) 1px, transparent 1px)',
                 backgroundSize: '8px 8px'
             }}>

            <div className="w-full h-2 bg-secondary relative">
                <div
                    className="h-full bg-primary transition-all duration-1000 ease-linear"
                    style={{width: `${timePercentage}%`}}
                />
            </div>
            <h2 className="py-4 text-xl font-semibold">
                Which statement correctly describes a Python list?
            </h2>
            <Button
                className="w-full mb-2"
                     selected={selectedAnswerIndex === 0}
                     onClick={() => handleAnswerSelect(0)}
            >
                A: It is a mutable, ordered collection.
            </Button>
            <Button
                className="w-full mb-2"
                     selected={selectedAnswerIndex === 1}
                     onClick={() => handleAnswerSelect(1)}
            >
                B: It is an immutable, unordered collection.
            </Button>
            <Button
                className="w-full mb-2"
                selected={selectedAnswerIndex === 2}
                onClick={() => handleAnswerSelect(2)}
            >
                C: It is a key-value mapping.
            </Button>
            <Button
                className="w-full mb-6"
                selected={selectedAnswerIndex === 3}
                onClick={() => handleAnswerSelect(3)}
            >
                D: It is a sequence of characters only.
            </Button>

            <div className="flex items-center justify-between mb-6">
                <div className="px-3 py-2 text-sm font-medium">
                    Is this your final answer?
                </div>
                <button className="w-20 h-20 rounded-full bg-muted-foreground text-white text-sm font-semibold flex items-center justify-center">
                    YES
                </button>
            </div>

            <div className="flex justify-between mb-6">
                <Button
                    className="w-36 mb-2"
                    onClick={() => {
                    }}
                >
                    50:50
                </Button>
                <Button
                    className="w-40 mb-2"
                    icon={<User size={16} />}
                    onClick={() => {
                    }}
                >
                    Ask the host
                </Button>
            </div>

            <div className="mb-6 text-sm text-foreground">
                <span className="font-semibold">Host:</span> So, you&apos;re going with D... Since it&apos;s in the easy category, I must tell you that lists can...
            </div>

            <div className="grid grid-cols-5 gap-2">
                {[500, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000, 100000, 250000, 500000, 1000000].map((amount, index) => (
                    <div
                        key={amount}
                        className={`
                            h-12 flex items-center justify-center text-xs font-medium
                            ${index < 2 ? 'bg-muted-foreground text-white' : 'bg-secondary text-foreground'}
                        `}
                    >
                        {amount.toLocaleString()}
                    </div>
                ))}
            </div>
        </div>
    )
}