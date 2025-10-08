interface InputProps {
    className?: string
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
    value?: string
    placeholder?: string
    disabled?: boolean
    type?: string
    name?: string
    autoFocus?: boolean
    id?: string
}

export default function Input({
    className = "",
    onChange,
    onKeyDown,
    value,
    placeholder,
    disabled = false,
    type = "text",
    name,
    autoFocus = false,
    id
}: InputProps) {
    const baseClasses = "h-12 px-4 text-sm bg-secondary outline-none focus:ring-2 focus:ring-primary"
    const disabledClass = disabled ? "cursor-not-allowed opacity-50" : ""

    return (
        <input
            id={id}
            type={type}
            name={name}
            className={`${baseClasses} ${disabledClass} ${className}`}
            onChange={onChange}
            onKeyDown={onKeyDown}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
        />
    )
}