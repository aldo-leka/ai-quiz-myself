"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { CountryStrips } from "@/components/CountryStrips";
import NicknamePrompt from "@/components/NicknamePrompt";
import { useGame } from "@/context/GameContext";
import {useEffect} from "react";

export default function Home() {
  const { state, setPlayers } = useGame()
  const router = useRouter()

  useEffect(() => {
    const getPlayerCountries = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/users-by-country`)
      const data = await response.json()
      setPlayers(data)
    }

    getPlayerCountries()

    const intervalId: NodeJS.Timeout = setInterval(getPlayerCountries, 10_000)
    return () => clearInterval(intervalId);
  }, [setPlayers])

  if (!state.nickname) {
    return <NicknamePrompt />
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <CountryStrips countryData={state.players} maxStrips={3} />
        </div>
        <div className="mt-6 p-6 sm:p-8 border rounded-lg shadow-sm bg-white max-w-lg mx-auto game-container">
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex flex-col sm:flex-row items-center justify-between">
              <p className="text-blue-800 font-medium text-xl mb-3 sm:mb-0">
                👥 {(() => {
                  const totalPlayers = Object.values(state.players).reduce((sum, count) => sum + count, 0);
                  return `${totalPlayers} ${totalPlayers === 1 ? 'Player' : 'Players'} Online`;
                })()}
              </p>
              <Button 
                className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md w-full sm:w-auto"
                onClick={() => router.push('/game')}
              >
                <span className="mr-2">▶</span> Play Now
              </Button>
            </div>
          </div>
          <div className="grid w-full items-center gap-2 mb-6">
            <Label htmlFor="gameCode" className="text-base font-medium">Game Code</Label>
            <Input id="gameCode" type="text" placeholder="ABCD" className="text-lg h-12" />
          </div>
          <Button type="submit" className="mb-6 w-full py-6 text-lg font-medium">Join Game</Button>
          <Separator className="mb-6" />
          <Button type="submit" className="w-full py-6 text-lg font-medium" variant="outline">Create New Game</Button>
        </div>
      </div>
    </div>
  );
}
