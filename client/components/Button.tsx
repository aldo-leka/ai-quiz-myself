interface ButtonProps {
    className?: string
    onClick?: () => void
    children: React.ReactNode
    selected?: boolean
    icon?: React.ReactNode
}

export default function Button({ className = "", onClick, children, selected = false, icon }: ButtonProps) {
    // Remove w-full from base, let className control width
    const baseClasses = "h-10 px-4 text-sm text-left flex items-center gap-2"
    const bgClass = selected ? "bg-muted-foreground text-white" : "bg-secondary"

    return (
        <button className={`${baseClasses} ${bgClass} ${className}`} onClick={onClick}>
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span>{children}</span>
        </button>
    )
}
