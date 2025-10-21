"use client";

import Button from "@/components/Button";
import {countries} from "@/lib/constants";
import CountryBlock from "@/components/CountryBlock";
import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";

interface Stat {
    nickname: string
    countryCode: string
    lastSeenAt: string
}

interface CountryData {
    code: string
    visitorCount: number
    lastActivity: number
}

interface PlayerActivity {
    username: string
    timestamp: number
}

export default function Home() {
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const [countriesData, setCountriesData] = useState<CountryData[]>([])
    const [countryPlayers, setCountryPlayers] = useState<Record<string, PlayerActivity[]>>({})
    const [username, setUsername] = useState<string | null>("")
    const router = useRouter()

    useEffect(() => {
        setUsername(localStorage.getItem("nickname"))
        showStats()
    }, [])

    async function showStats() {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/stats`)
        const stats: Stat[] = await response.json()
        const grouped = Object.groupBy(stats, stat => stat.countryCode);

        const playersData: Record<string, PlayerActivity[]> = {};

        Object.entries(grouped).forEach(([code, statsForCountry]) => {
            if (statsForCountry) {
                playersData[code] = statsForCountry.map(stat => ({
                    username: stat.nickname,
                    timestamp: new Date(stat.lastSeenAt).getTime()
                }))
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 3);
            }
        });

        Object.keys(countries).forEach(code => {
            if (!playersData[code]) {
                playersData[code] = [];
            }
        });

        setCountryPlayers(playersData);

        const countryData: CountryData[] = Object.keys(countries).map(code => {
            const statsForCountry = grouped[code]

            if (!statsForCountry || statsForCountry.length === 0) {
                return {
                    code,
                    visitorCount: 0,
                    lastActivity: 0
                }
            }

            return {
                code,
                visitorCount: statsForCountry.length,
                lastActivity: Math.max(...statsForCountry.map(s => new Date(s.lastSeenAt).getTime()))
            }
        })
            .sort((a, b) => b.lastActivity - a.lastActivity)

        setCountriesData(countryData)
    }

    const handleCountryClick = (countryCode: string) => {
        setSelectedCountry(selectedCountry === countryCode ? null : countryCode)
    }

    const formatTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000)

        if (seconds < 60) return 'just now'
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
        if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`
        if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`
        return '> 1 year ago'
    }

    const renderCountryGrid = () => {
        if (selectedCountry === null) {
            // Normal grid layout
            return countriesData.map(countryData => (
                <CountryBlock
                    key={countryData.code}
                    country={countries[countryData.code]}
                    visitorCount={countryData.visitorCount}
                    isSelected={false}
                    onClick={() => handleCountryClick(countryData.code)}
                />
            ))
        }

        // Selected country layout
        const selectedIndex = countriesData.findIndex(c => c.code === selectedCountry)
        const selectedCountryData = countriesData[selectedIndex]
        const players = countryPlayers[selectedCountry] || []

        // Calculate how many empty cells we need to push selected country to new row
        // Grid cols: 3 (base), 4 (sm), 5 (md), 6 (lg), 7 (xl)
        const gridCols = [3, 4, 5, 6, 7]
        const emptyCells = gridCols.map(cols => {
            const remainder = selectedIndex % cols
            return remainder === 0 ? 0 : cols - remainder
        })

        return (
            <>
                {countriesData.slice(0, selectedIndex).map(countryData => (
                    <CountryBlock
                        key={countryData.code}
                        country={countries[countryData.code]}
                        visitorCount={countryData.visitorCount}
                        isSelected={false}
                        onClick={() => handleCountryClick(countryData.code)}
                    />
                ))}

                {/* Empty cells to push selected country to new row */}
                {emptyCells[0] > 0 && Array.from({length: emptyCells[0]}).map((_, i) => (
                    <div key={`empty-base-${i}`} className="sm:hidden"/>
                ))}
                {emptyCells[1] > 0 && Array.from({length: emptyCells[1]}).map((_, i) => (
                    <div key={`empty-sm-${i}`} className="hidden sm:block md:hidden"/>
                ))}
                {emptyCells[2] > 0 && Array.from({length: emptyCells[2]}).map((_, i) => (
                    <div key={`empty-md-${i}`} className="hidden md:block lg:hidden"/>
                ))}
                {emptyCells[3] > 0 && Array.from({length: emptyCells[3]}).map((_, i) => (
                    <div key={`empty-lg-${i}`} className="hidden lg:block xl:hidden"/>
                ))}
                {emptyCells[4] > 0 && Array.from({length: emptyCells[4]}).map((_, i) => (
                    <div key={`empty-xl-${i}`} className="hidden xl:block"/>
                ))}

                <CountryBlock
                    key={selectedCountryData.code}
                    country={countries[selectedCountryData.code]}
                    visitorCount={selectedCountryData.visitorCount}
                    isSelected={true}
                    onClick={() => handleCountryClick(selectedCountryData.code)}
                />

                <div
                    className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-5 xl:col-span-6 bg-secondary/50 p-4 flex flex-col gap-2">
                    {players.length > 0 ? (
                        <div className="space-y-1">
                            {players.map((player, idx) => (
                                <div key={idx} className="text-xs">
                                    <span
                                        className="font-medium">{player.username}</span> last seen {formatTimeAgo(player.timestamp)}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground">No recent activity</div>
                    )}
                </div>

                {countriesData.slice(selectedIndex + 1).map(countryData => (
                    <CountryBlock
                        key={countryData.code}
                        country={countries[countryData.code]}
                        visitorCount={countryData.visitorCount}
                        isSelected={false}
                        onClick={() => handleCountryClick(countryData.code)}
                    />
                ))}
            </>
        )
    }

    return (
        <div
            className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 mx-auto w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl select-none">
            <h2 className="sm:py-4 text-lg sm:text-xl md:text-2xl font-semibold">
                Which game would you like to play, {username}?
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-4 sm:mb-6">
                <Button
                    onClick={() => router.push("/wwtbam")}
                >
                    A: Who Wants to Be a Millionaire?
                </Button>
                <Button disabled>
                    B: Global Game
                </Button>
                <Button disabled>
                    C: Single Player
                </Button>
                <Button disabled>
                    D: Multi Player
                </Button>
            </div>
            <div
                className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1 sm:gap-2">
                <div className="col-span-3 sm:col-span-4 md:col-span-5 lg:col-span-6 xl:col-span-7">All-time unique
                    visitors:
                </div>
                {renderCountryGrid()}
            </div>
        </div>
    );
}
