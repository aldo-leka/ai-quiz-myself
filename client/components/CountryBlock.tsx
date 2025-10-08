"use client"

import {Country} from "@/lib/types";

interface CountryBlockProps {
    country: Country
    visitorCount: number
    isSelected: boolean
    onClick: () => void
}

export default function CountryBlock({country, visitorCount, isSelected, onClick}: CountryBlockProps) {
    return (
        <div
            className={`
                h-16 sm:h-20 md:h-24 flex flex-col justify-between p-2 cursor-pointer transition-colors
                ${isSelected ? 'bg-muted-foreground text-white' : 'bg-secondary text-foreground'}
            `}
            onClick={onClick}
        >
            <div className="flex items-center gap-1">
                <span className="text-lg flex-shrink-0">{country.flag}</span>
                <span className="text-[8px] font-medium line-clamp-3 break-all">{country.name}</span>
            </div>
            <div className="text-[8px]">
                {visitorCount.toLocaleString()} {visitorCount === 1 ? 'visitor' : 'visitors'}
            </div>
        </div>
    )
}