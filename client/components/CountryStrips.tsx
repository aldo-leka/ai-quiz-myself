"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { getCountryInfo } from "@/lib/countryFlags";

export interface CountryStripsProps {
  countryData: Record<string, number>;
  maxStrips?: number;  // Maximum number of strips to display
  countriesPerStrip?: number;  // Number of countries to show per strip (will adjust based on screen size)
}

export function CountryStrips({ 
  countryData, 
  maxStrips = 3,
  countriesPerStrip = 10 
}: CountryStripsProps) {
  // Adjust countriesPerStrip based on viewport width
  const [dynamicCountriesPerStrip, setDynamicCountriesPerStrip] = useState(countriesPerStrip);
  
  useEffect(() => {
    // Initial setting
    handleResize();
    
    // Add resize listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  function handleResize() {
    const width = window.innerWidth;
    if (width < 640) { // Mobile
      setDynamicCountriesPerStrip(5);
    } else if (width < 1024) { // Tablet
      setDynamicCountriesPerStrip(8);
    } else if (width < 1280) { // Small desktop
      setDynamicCountriesPerStrip(10);
    } else { // Large desktop
      setDynamicCountriesPerStrip(15);
    }
  }
  // Sort countries by player count (descending)
  const sortedCountries = useMemo(() => {
    return Object.entries(countryData)
      .sort((a, b) => b[1] - a[1]);  // Sort by count (descending)
  }, [countryData]);

  // If no countries, return null
  if (sortedCountries.length === 0) {
    return null;
  }

  // Create strips
  const strips: Array<Array<[string, number]>> = [];
  
  // Fill strips with countries
  for (let i = 0; i < Math.min(maxStrips, Math.ceil(sortedCountries.length / dynamicCountriesPerStrip)); i++) {
    const start = i * dynamicCountriesPerStrip;
    const end = Math.min(start + dynamicCountriesPerStrip, sortedCountries.length);
    strips.push(sortedCountries.slice(start, end));
  }

  return (
    <div className="w-full space-y-1">
      {strips.map((strip, stripIndex) => (
        <div key={stripIndex} className="flex w-full h-9 overflow-hidden rounded-md shadow-sm">
          {strip.map(([countryCode, count], index) => {
            // Calculate relative width based on player count
            const totalPlayers = strip.reduce((sum, [, count]) => sum + count, 0);
            const width = Math.max(5, (count / totalPlayers) * 100); // Minimum 5% width
            
            return (
              <Tooltip key={countryCode}>
                <TooltipTrigger asChild>
                  <div
                    className="h-full flex items-center justify-center text-xs text-white font-medium transition-all cursor-pointer"
                    style={{
                      width: `${width}%`,
                      backgroundColor: getColorForIndex(index),
                    }}
                  >
                    <span className="mr-1">{getCountryInfo(countryCode).flag}</span>
                    <span>{count}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-black/90 text-white px-3 py-1.5 rounded-md text-xs">
                  {getCountryInfo(countryCode).name}: {count} players
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Color generator for strip segments
function getColorForIndex(index: number): string {
  const colors = [
    'rgb(37, 99, 235)',   // blue-600
    'rgb(79, 70, 229)',   // indigo-600
    'rgb(124, 58, 237)',  // purple-600
    'rgb(217, 70, 239)',  // fuchsia-600
    'rgb(219, 39, 119)',  // pink-600
    'rgb(225, 29, 72)',   // rose-600
    'rgb(234, 88, 12)',   // orange-600
    'rgb(202, 138, 4)',   // amber-600
    'rgb(101, 163, 13)',  // lime-600
    'rgb(5, 150, 105)',   // emerald-600
    'rgb(13, 148, 136)',  // teal-600
    'rgb(8, 145, 178)',   // cyan-600
  ];
  
  return colors[index % colors.length];
}