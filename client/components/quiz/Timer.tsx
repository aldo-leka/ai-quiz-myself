export interface TimerProps {
    remainingTime?: number
}

export default function Timer({remainingTime}: TimerProps) {
    return (
        <>
            <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-1000"
                    style={{width: `${(remainingTime || 0) / 15 * 100}%`}}
                ></div>
            </div>

            <div className="flex justify-between items-center">
                <div className="text-sm font-medium text-gray-500">
                    Time remaining: {remainingTime}s
                </div>
            </div>
        </>
    )
}