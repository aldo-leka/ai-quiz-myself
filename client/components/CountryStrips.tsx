"use client";

import { useMemo, useState, useEffect } from "react";
import { 
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

// A more comprehensive list of country codes to flag emojis
// Country flags and names
const countryInfo: Record<string, { flag: string, name: string }> = {
  'AD': { flag: '🇦🇩', name: 'Andorra' },
  'AE': { flag: '🇦🇪', name: 'United Arab Emirates' },
  'AF': { flag: '🇦🇫', name: 'Afghanistan' },
  'AG': { flag: '🇦🇬', name: 'Antigua and Barbuda' },
  'AI': { flag: '🇦🇮', name: 'Anguilla' },
  'AL': { flag: '🇦🇱', name: 'Albania' },
  'AM': { flag: '🇦🇲', name: 'Armenia' },
  'AO': { flag: '🇦🇴', name: 'Angola' },
  'AR': { flag: '🇦🇷', name: 'Argentina' },
  'AS': { flag: '🇦🇸', name: 'American Samoa' },
  'AT': { flag: '🇦🇹', name: 'Austria' },
  'AU': { flag: '🇦🇺', name: 'Australia' },
  'AW': { flag: '🇦🇼', name: 'Aruba' },
  'AX': { flag: '🇦🇽', name: 'Åland Islands' },
  'AZ': { flag: '🇦🇿', name: 'Azerbaijan' },
  'BA': { flag: '🇧🇦', name: 'Bosnia and Herzegovina' },
  'BB': { flag: '🇧🇧', name: 'Barbados' },
  'BD': { flag: '🇧🇩', name: 'Bangladesh' },
  'BE': { flag: '🇧🇪', name: 'Belgium' },
  'BF': { flag: '🇧🇫', name: 'Burkina Faso' },
  'BG': { flag: '🇧🇬', name: 'Bulgaria' },
  'BH': { flag: '🇧🇭', name: 'Bahrain' },
  'BI': { flag: '🇧🇮', name: 'Burundi' },
  'BJ': { flag: '🇧🇯', name: 'Benin' },
  'BL': { flag: '🇧🇱', name: 'Saint Barthélemy' },
  'BM': { flag: '🇧🇲', name: 'Bermuda' },
  'BN': { flag: '🇧🇳', name: 'Brunei' },
  'BO': { flag: '🇧🇴', name: 'Bolivia' },
  'BR': { flag: '🇧🇷', name: 'Brazil' },
  'BS': { flag: '🇧🇸', name: 'Bahamas' },
  'BT': { flag: '🇧🇹', name: 'Bhutan' },
  'BV': { flag: '🇧🇻', name: 'Bouvet Island' },
  'BW': { flag: '🇧🇼', name: 'Botswana' },
  'BY': { flag: '🇧🇾', name: 'Belarus' },
  'BZ': { flag: '🇧🇿', name: 'Belize' },
  'CA': { flag: '🇨🇦', name: 'Canada' },
  'CD': { flag: '🇨🇩', name: 'Congo (DRC)' },
  'CF': { flag: '🇨🇫', name: 'Central African Republic' },
  'CG': { flag: '🇨🇬', name: 'Congo' },
  'CH': { flag: '🇨🇭', name: 'Switzerland' },
  'CI': { flag: '🇨🇮', name: 'Côte d\'Ivoire' },
  'CK': { flag: '🇨🇰', name: 'Cook Islands' },
  'CL': { flag: '🇨🇱', name: 'Chile' },
  'CM': { flag: '🇨🇲', name: 'Cameroon' },
  'CN': { flag: '🇨🇳', name: 'China' },
  'CO': { flag: '🇨🇴', name: 'Colombia' },
  'CR': { flag: '🇨🇷', name: 'Costa Rica' },
  'CU': { flag: '🇨🇺', name: 'Cuba' },
  'CV': { flag: '🇨🇻', name: 'Cape Verde' },
  'CW': { flag: '🇨🇼', name: 'Curaçao' },
  'CY': { flag: '🇨🇾', name: 'Cyprus' },
  'CZ': { flag: '🇨🇿', name: 'Czechia' },
  'DE': { flag: '🇩🇪', name: 'Germany' },
  'DJ': { flag: '🇩🇯', name: 'Djibouti' },
  'DK': { flag: '🇩🇰', name: 'Denmark' },
  'DM': { flag: '🇩🇲', name: 'Dominica' },
  'DO': { flag: '🇩🇴', name: 'Dominican Republic' },
  'DZ': { flag: '🇩🇿', name: 'Algeria' },
  'EC': { flag: '🇪🇨', name: 'Ecuador' },
  'EE': { flag: '🇪🇪', name: 'Estonia' },
  'EG': { flag: '🇪🇬', name: 'Egypt' },
  'EH': { flag: '🇪🇭', name: 'Western Sahara' },
  'ER': { flag: '🇪🇷', name: 'Eritrea' },
  'ES': { flag: '🇪🇸', name: 'Spain' },
  'ET': { flag: '🇪🇹', name: 'Ethiopia' },
  'FI': { flag: '🇫🇮', name: 'Finland' },
  'FJ': { flag: '🇫🇯', name: 'Fiji' },
  'FK': { flag: '🇫🇰', name: 'Falkland Islands' },
  'FM': { flag: '🇫🇲', name: 'Micronesia' },
  'FO': { flag: '🇫🇴', name: 'Faroe Islands' },
  'FR': { flag: '🇫🇷', name: 'France' },
  'GA': { flag: '🇬🇦', name: 'Gabon' },
  'GB': { flag: '🇬🇧', name: 'United Kingdom' },
  'GD': { flag: '🇬🇩', name: 'Grenada' },
  'GE': { flag: '🇬🇪', name: 'Georgia' },
  'GF': { flag: '🇬🇫', name: 'French Guiana' },
  'GG': { flag: '🇬🇬', name: 'Guernsey' },
  'GH': { flag: '🇬🇭', name: 'Ghana' },
  'GI': { flag: '🇬🇮', name: 'Gibraltar' },
  'GL': { flag: '🇬🇱', name: 'Greenland' },
  'GM': { flag: '🇬🇲', name: 'Gambia' },
  'GN': { flag: '🇬🇳', name: 'Guinea' },
  'GP': { flag: '🇬🇵', name: 'Guadeloupe' },
  'GQ': { flag: '🇬🇶', name: 'Equatorial Guinea' },
  'GR': { flag: '🇬🇷', name: 'Greece' },
  'GS': { flag: '🇬🇸', name: 'South Georgia' },
  'GT': { flag: '🇬🇹', name: 'Guatemala' },
  'GU': { flag: '🇬🇺', name: 'Guam' },
  'GW': { flag: '🇬🇼', name: 'Guinea-Bissau' },
  'GY': { flag: '🇬🇾', name: 'Guyana' },
  'HK': { flag: '🇭🇰', name: 'Hong Kong' },
  'HM': { flag: '🇭🇲', name: 'Heard Island' },
  'HN': { flag: '🇭🇳', name: 'Honduras' },
  'HR': { flag: '🇭🇷', name: 'Croatia' },
  'HT': { flag: '🇭🇹', name: 'Haiti' },
  'HU': { flag: '🇭🇺', name: 'Hungary' },
  'ID': { flag: '🇮🇩', name: 'Indonesia' },
  'IE': { flag: '🇮🇪', name: 'Ireland' },
  'IL': { flag: '🇮🇱', name: 'Israel' },
  'IM': { flag: '🇮🇲', name: 'Isle of Man' },
  'IN': { flag: '🇮🇳', name: 'India' },
  'IO': { flag: '🇮🇴', name: 'British Indian Ocean Territory' },
  'IQ': { flag: '🇮🇶', name: 'Iraq' },
  'IR': { flag: '🇮🇷', name: 'Iran' },
  'IS': { flag: '🇮🇸', name: 'Iceland' },
  'IT': { flag: '🇮🇹', name: 'Italy' },
  'JE': { flag: '🇯🇪', name: 'Jersey' },
  'JM': { flag: '🇯🇲', name: 'Jamaica' },
  'JO': { flag: '🇯🇴', name: 'Jordan' },
  'JP': { flag: '🇯🇵', name: 'Japan' },
  'KE': { flag: '🇰🇪', name: 'Kenya' },
  'KG': { flag: '🇰🇬', name: 'Kyrgyzstan' },
  'KH': { flag: '🇰🇭', name: 'Cambodia' },
  'KI': { flag: '🇰🇮', name: 'Kiribati' },
  'KM': { flag: '🇰🇲', name: 'Comoros' },
  'KN': { flag: '🇰🇳', name: 'Saint Kitts and Nevis' },
  'KP': { flag: '🇰🇵', name: 'North Korea' },
  'KR': { flag: '🇰🇷', name: 'South Korea' },
  'KW': { flag: '🇰🇼', name: 'Kuwait' },
  'KY': { flag: '🇰🇾', name: 'Cayman Islands' },
  'KZ': { flag: '🇰🇿', name: 'Kazakhstan' },
  'LA': { flag: '🇱🇦', name: 'Laos' },
  'LB': { flag: '🇱🇧', name: 'Lebanon' },
  'LC': { flag: '🇱🇨', name: 'Saint Lucia' },
  'LI': { flag: '🇱🇮', name: 'Liechtenstein' },
  'LK': { flag: '🇱🇰', name: 'Sri Lanka' },
  'LR': { flag: '🇱🇷', name: 'Liberia' },
  'LS': { flag: '🇱🇸', name: 'Lesotho' },
  'LT': { flag: '🇱🇹', name: 'Lithuania' },
  'LU': { flag: '🇱🇺', name: 'Luxembourg' },
  'LV': { flag: '🇱🇻', name: 'Latvia' },
  'LY': { flag: '🇱🇾', name: 'Libya' },
  'MA': { flag: '🇲🇦', name: 'Morocco' },
  'MC': { flag: '🇲🇨', name: 'Monaco' },
  'MD': { flag: '🇲🇩', name: 'Moldova' },
  'ME': { flag: '🇲🇪', name: 'Montenegro' },
  'MF': { flag: '🇲🇫', name: 'Saint Martin' },
  'MG': { flag: '🇲🇬', name: 'Madagascar' },
  'MH': { flag: '🇲🇭', name: 'Marshall Islands' },
  'MK': { flag: '🇲🇰', name: 'North Macedonia' },
  'ML': { flag: '🇲🇱', name: 'Mali' },
  'MM': { flag: '🇲🇲', name: 'Myanmar' },
  'MN': { flag: '🇲🇳', name: 'Mongolia' },
  'MO': { flag: '🇲🇴', name: 'Macau' },
  'MP': { flag: '🇲🇵', name: 'Northern Mariana Islands' },
  'MQ': { flag: '🇲🇶', name: 'Martinique' },
  'MR': { flag: '🇲🇷', name: 'Mauritania' },
  'MS': { flag: '🇲🇸', name: 'Montserrat' },
  'MT': { flag: '🇲🇹', name: 'Malta' },
  'MU': { flag: '🇲🇺', name: 'Mauritius' },
  'MV': { flag: '🇲🇻', name: 'Maldives' },
  'MW': { flag: '🇲🇼', name: 'Malawi' },
  'MX': { flag: '🇲🇽', name: 'Mexico' },
  'MY': { flag: '🇲🇾', name: 'Malaysia' },
  'MZ': { flag: '🇲🇿', name: 'Mozambique' },
  'NA': { flag: '🇳🇦', name: 'Namibia' },
  'NC': { flag: '🇳🇨', name: 'New Caledonia' },
  'NE': { flag: '🇳🇪', name: 'Niger' },
  'NF': { flag: '🇳🇫', name: 'Norfolk Island' },
  'NG': { flag: '🇳🇬', name: 'Nigeria' },
  'NI': { flag: '🇳🇮', name: 'Nicaragua' },
  'NL': { flag: '🇳🇱', name: 'Netherlands' },
  'NO': { flag: '🇳🇴', name: 'Norway' },
  'NP': { flag: '🇳🇵', name: 'Nepal' },
  'NR': { flag: '🇳🇷', name: 'Nauru' },
  'NU': { flag: '🇳🇺', name: 'Niue' },
  'NZ': { flag: '🇳🇿', name: 'New Zealand' },
  'OM': { flag: '🇴🇲', name: 'Oman' },
  'PA': { flag: '🇵🇦', name: 'Panama' },
  'PE': { flag: '🇵🇪', name: 'Peru' },
  'PF': { flag: '🇵🇫', name: 'French Polynesia' },
  'PG': { flag: '🇵🇬', name: 'Papua New Guinea' },
  'PH': { flag: '🇵🇭', name: 'Philippines' },
  'PK': { flag: '🇵🇰', name: 'Pakistan' },
  'PL': { flag: '🇵🇱', name: 'Poland' },
  'PM': { flag: '🇵🇲', name: 'Saint Pierre and Miquelon' },
  'PN': { flag: '🇵🇳', name: 'Pitcairn Islands' },
  'PR': { flag: '🇵🇷', name: 'Puerto Rico' },
  'PS': { flag: '🇵🇸', name: 'Palestine' },
  'PT': { flag: '🇵🇹', name: 'Portugal' },
  'PW': { flag: '🇵🇼', name: 'Palau' },
  'PY': { flag: '🇵🇾', name: 'Paraguay' },
  'QA': { flag: '🇶🇦', name: 'Qatar' },
  'RE': { flag: '🇷🇪', name: 'Réunion' },
  'RO': { flag: '🇷🇴', name: 'Romania' },
  'RS': { flag: '🇷🇸', name: 'Serbia' },
  'RU': { flag: '🇷🇺', name: 'Russia' },
  'RW': { flag: '🇷🇼', name: 'Rwanda' },
  'SA': { flag: '🇸🇦', name: 'Saudi Arabia' },
  'SB': { flag: '🇸🇧', name: 'Solomon Islands' },
  'SC': { flag: '🇸🇨', name: 'Seychelles' },
  'SD': { flag: '🇸🇩', name: 'Sudan' },
  'SE': { flag: '🇸🇪', name: 'Sweden' },
  'SG': { flag: '🇸🇬', name: 'Singapore' },
  'SH': { flag: '🇸🇭', name: 'Saint Helena' },
  'SI': { flag: '🇸🇮', name: 'Slovenia' },
  'SJ': { flag: '🇸🇯', name: 'Svalbard and Jan Mayen' },
  'SK': { flag: '🇸🇰', name: 'Slovakia' },
  'SL': { flag: '🇸🇱', name: 'Sierra Leone' },
  'SM': { flag: '🇸🇲', name: 'San Marino' },
  'SN': { flag: '🇸🇳', name: 'Senegal' },
  'SO': { flag: '🇸🇴', name: 'Somalia' },
  'SR': { flag: '🇸🇷', name: 'Suriname' },
  'SS': { flag: '🇸🇸', name: 'South Sudan' },
  'ST': { flag: '🇸🇹', name: 'São Tomé and Príncipe' },
  'SV': { flag: '🇸🇻', name: 'El Salvador' },
  'SX': { flag: '🇸🇽', name: 'Sint Maarten' },
  'SY': { flag: '🇸🇾', name: 'Syria' },
  'SZ': { flag: '🇸🇿', name: 'Eswatini' },
  'TC': { flag: '🇹🇨', name: 'Turks and Caicos Islands' },
  'TD': { flag: '🇹🇩', name: 'Chad' },
  'TF': { flag: '🇹🇫', name: 'French Southern Territories' },
  'TG': { flag: '🇹🇬', name: 'Togo' },
  'TH': { flag: '🇹🇭', name: 'Thailand' },
  'TJ': { flag: '🇹🇯', name: 'Tajikistan' },
  'TK': { flag: '🇹🇰', name: 'Tokelau' },
  'TL': { flag: '🇹🇱', name: 'Timor-Leste' },
  'TM': { flag: '🇹🇲', name: 'Turkmenistan' },
  'TN': { flag: '🇹🇳', name: 'Tunisia' },
  'TO': { flag: '🇹🇴', name: 'Tonga' },
  'TR': { flag: '🇹🇷', name: 'Turkey' },
  'TT': { flag: '🇹🇹', name: 'Trinidad and Tobago' },
  'TV': { flag: '🇹🇻', name: 'Tuvalu' },
  'TW': { flag: '🇹🇼', name: 'Taiwan' },
  'TZ': { flag: '🇹🇿', name: 'Tanzania' },
  'UA': { flag: '🇺🇦', name: 'Ukraine' },
  'UG': { flag: '🇺🇬', name: 'Uganda' },
  'US': { flag: '🇺🇸', name: 'United States' },
  'UY': { flag: '🇺🇾', name: 'Uruguay' },
  'UZ': { flag: '🇺🇿', name: 'Uzbekistan' },
  'VA': { flag: '🇻🇦', name: 'Vatican City' },
  'VC': { flag: '🇻🇨', name: 'Saint Vincent and the Grenadines' },
  'VE': { flag: '🇻🇪', name: 'Venezuela' },
  'VG': { flag: '🇻🇬', name: 'British Virgin Islands' },
  'VI': { flag: '🇻🇮', name: 'U.S. Virgin Islands' },
  'VN': { flag: '🇻🇳', name: 'Vietnam' },
  'VU': { flag: '🇻🇺', name: 'Vanuatu' },
  'WF': { flag: '🇼🇫', name: 'Wallis and Futuna' },
  'WS': { flag: '🇼🇸', name: 'Samoa' },
  'YE': { flag: '🇾🇪', name: 'Yemen' },
  'YT': { flag: '🇾🇹', name: 'Mayotte' },
  'ZA': { flag: '🇿🇦', name: 'South Africa' },
  'ZM': { flag: '🇿🇲', name: 'Zambia' },
  'ZW': { flag: '🇿🇼', name: 'Zimbabwe' },
  'UNKNOWN': { flag: '🌐', name: 'Unknown' }
};

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
            const totalPlayers = strip.reduce((sum, [_, count]) => sum + count, 0);
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
                    <span className="mr-1">{countryInfo[countryCode]?.flag || countryCode}</span>
                    <span>{count}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-black/90 text-white px-3 py-1.5 rounded-md text-xs">
                  {countryInfo[countryCode]?.name || countryCode}: {count} players
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