export interface IntroProps {
    animationComplete: boolean
    theme: string
    difficulty: string
}

export default function Intro({ animationComplete, theme, difficulty }: IntroProps) {
    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm">
            <div
                className={`
                                flex flex-col items-center gap-5 p-10 bg-white rounded-xl shadow-xl 
                                transition-all duration-1000 ease-in-out transform
                                ${animationComplete ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}
                            `}
            >
                <h2 className="text-3xl font-bold text-gray-900">Get Ready!</h2>

                <div className="flex flex-col items-center gap-6 my-8">
                    <div className="px-6 py-3 bg-blue-100 text-blue-800 rounded-full text-2xl font-bold">
                        {theme}
                    </div>

                    <div className="px-6 py-3 bg-purple-100 text-purple-800 rounded-full text-2xl font-bold">
                        {difficulty}
                    </div>
                </div>

                <div className="text-lg text-gray-600 animate-pulse">
                    Game starting...
                </div>
            </div>
        </div>
    )
}