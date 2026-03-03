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
};

export function PlayerSelect<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  widthClassName = "w-full sm:w-72",
  disabled = false,
}: PlayerSelectProps<T>) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          "h-12 rounded-2xl border-slate-700 bg-slate-950/80 px-4 text-base text-slate-100 shadow-[0_0_0_1px_rgba(34,211,238,0.12)] transition",
          "data-[state=open]:border-cyan-400 data-[state=open]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_12px_36px_rgba(8,47,73,0.55)]",
          "focus-visible:ring-cyan-400/60",
          widthClassName,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className={cn(
          "rounded-2xl border-cyan-500/45 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-md",
        )}
        position="popper"
        align="start"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="rounded-xl py-2.5 pr-8 pl-3 text-sm text-slate-100 focus:bg-cyan-500/20 focus:text-cyan-100 data-[state=checked]:bg-cyan-500/15"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
