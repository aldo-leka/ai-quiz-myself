"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type PlayerSelectOption<T extends string> = {
  value: T;
  label: string;
};

type PlayerSelectProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: PlayerSelectOption<T>[];
  placeholder?: string;
  widthClassName?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerId?: string;
};

export function PlayerSelect<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  widthClassName = "w-full sm:w-72",
  disabled = false,
  open,
  onOpenChange,
  triggerId,
}: PlayerSelectProps<T>) {
  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
    >
      <SelectTrigger
        data-tv-id={triggerId}
        className={cn(
          "min-h-14 rounded-full border-[#252940] bg-[#0f1117]/88 px-6 py-2.5 text-lg font-semibold text-[#e4e4e9] shadow-[0_0_0_1px_rgba(108,138,255,0.14)] transition md:min-h-16 md:px-7 md:text-2xl data-[size=default]:h-auto",
          "data-[state=open]:border-[#818cf8]/55 data-[state=open]:shadow-[0_0_0_1px_rgba(129,140,248,0.24),0_16px_40px_rgba(15,17,23,0.46)]",
          "focus-visible:ring-[#818cf8]/55",
          widthClassName,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className={cn(
          "rounded-2xl border-[#6c8aff]/40 bg-[#1a1d2e]/96 text-[#e4e4e9] shadow-2xl backdrop-blur-md",
        )}
        position="popper"
        align="start"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="rounded-xl py-3 pr-8 pl-4 text-base text-[#e4e4e9] focus:bg-[#6c8aff]/18 focus:text-[#e4e4e9] data-[state=checked]:bg-[#6c8aff]/14 md:text-lg"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
