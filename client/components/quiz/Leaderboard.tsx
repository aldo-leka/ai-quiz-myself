import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {getCountryInfo} from "@/lib/countryFlags";
import {GlobalGameLeaderboardPlayer} from "@/lib/types";

export interface LeaderboardProps {
    leaderBoard: GlobalGameLeaderboardPlayer[]
    remainingTime?: number
}

export default function Leaderboard({ leaderBoard, remainingTime }: LeaderboardProps) {
    return (
        <div className="space-y-6">

            <div className="p-6 bg-white shadow-sm rounded-lg border border-gray-100">
                <div className="space-y-3">
                    {leaderBoard.map((player, index) => (
                        <div key={index} className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex-none w-8 h-8 flex items-center justify-center font-semibold">
                                {index + 1}
                            </div>
                            <div className="ml-3 flex-grow flex items-center">
                                <div className="font-medium">{player.nickname}</div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="ml-2 cursor-pointer">
                                            {getCountryInfo(player.country).flag}
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-black/90 text-white px-3 py-1.5 rounded-md text-xs">
                                        {getCountryInfo(player.country).name}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <div className="flex-none font-semibold text-blue-600">
                                {player.score} pts
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-center mt-4">
                <div className="text-gray-600 animate-pulse">
                    Loading new game in {remainingTime}s...
                </div>
            </div>
        </div>
    )
}