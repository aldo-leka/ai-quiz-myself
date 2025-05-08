"use client";

import {Button} from "@/components/ui/button";
import {CountryStrips} from "@/components/CountryStrips";
import {useGame} from "@/context/GameContext";
import NicknamePrompt from "@/components/NicknamePrompt";

export default function GamePage(){
    const {state} = useGame()

    if (!state.nickname) {
        return <NicknamePrompt />
    }

    return (
        <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-slate-50">
            <div className="max-w-3xl mx-auto p-4">
                <div className="mb-6">
                    <CountryStrips countryData={state.players} maxStrips={3} />
                </div>
                <Button>Lock Answer</Button>
            </div>
        </div>
    )
}