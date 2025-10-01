interface ButtonProps {
    className?: string
    onClick?: () => void
    children: React.ReactNode
    selected?: boolean
    icon?: React.ReactNode
    centered?: boolean
    disabled?: boolean
}

export default function Button({ className = "", onClick, children, selected = false, icon, centered = false, disabled = false }: ButtonProps) {
    const baseClasses = `h-12 px-4 text-sm ${centered ? 'justify-center' : 'text-left'} flex items-center gap-2`
    const bgClass = selected ? "bg-muted-foreground text-white" : "bg-secondary"
    const disabledClass = disabled ? "cursor-not-allowed" : "" // opacity-50

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
