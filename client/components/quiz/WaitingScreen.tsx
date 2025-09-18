export interface WaitingProps {
    remainingTime?: number
}

export default function WaitingScreen({ remainingTime }: WaitingProps) {
    return (
        <div className="flex flex-col items-center justify-center p-8">
            <div className="text-xl font-semibold mb-2">Waiting for game to start in {remainingTime}s...</div>
            <div className="text-gray-600 mb-4">You&apos;ll be automatically added to the next game</div>
        </div>
    )
}