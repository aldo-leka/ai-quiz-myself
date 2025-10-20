interface CircularButtonProps {
    children: React.ReactNode
    onClick?: () => void
    selected?: boolean
    className?: string
    disabled?: boolean
}

export default function CircularButton({ children, onClick, selected = false, className = "", disabled = false }: CircularButtonProps) {
    const disabledClass = disabled ? "cursor-not-allowed opacity-50" : ""

    return (
        <button
            className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full text-xs sm:text-sm md:text-base flex items-center justify-center ${
                selected
                    ? 'bg-muted-foreground text-white'
                    : 'bg-secondary text-foreground'
            } ${disabledClass} ${className}`}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
        >
            {children}
        </button>
    )
}