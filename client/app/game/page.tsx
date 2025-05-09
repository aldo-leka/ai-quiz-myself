"use client";

import {Button} from "@/components/ui/button";
import {CountryStrips} from "@/components/CountryStrips";
import {useGame} from "@/context/GameContext";
import NicknamePrompt from "@/components/NicknamePrompt";
import {useEffect} from "react";
import {socket} from "@/socket";
import {Player} from "@/lib/types";

export default function GamePage(){
    const { state, setGameCode } = useGame()

    useEffect(() => {
        if (state.nickname) {
            socket.emit("join global game")
        }

        setGameCode("global game")

        const handlePlayerJoin = (player: Player) => {
            console.log(`${player.nickname} from ${player.country} joined global game`)
        }

        socket.on("player joined global game", handlePlayerJoin)

        return () => {
            socket.emit("leave global game")
            setGameCode(undefined)
            socket.off("player joined global game", handlePlayerJoin)
        }
    }, [state.nickname])

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