interface ButtonProps {
    className?: string
    onClick?: () => void
    children: React.ReactNode
    selected?: boolean
    icon?: React.ReactNode
    centered?: boolean
    disabled?: boolean
    orange?: boolean
    correct?: boolean
}

export default function Button({ className = "", onClick, children, selected = false, icon, centered = false, disabled = false, orange = false, correct = false }: ButtonProps) {
    const baseClasses = `h-12 px-4 text-sm ${centered ? 'justify-center' : 'text-left'} flex items-center gap-2`

    // Priority: correct (green) > orange (final answer) > selected (gray) > default
    let bgClass = "bg-secondary"
    if (correct) {
        bgClass = "bg-green-600 text-white"
    } else if (orange) {
        bgClass = "bg-orange-500 text-white"
    } else if (selected) {
        bgClass = "bg-muted-foreground text-white"
    }

    const disabledClass = disabled ? `cursor-not-allowed ${!(correct || orange) ? "opacity-50" : ""}` : ""

    return (
        <button
            className={`${baseClasses} ${bgClass} ${disabledClass} ${className}`}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
        >
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span>{children}</span>
        </button>
    )
}
