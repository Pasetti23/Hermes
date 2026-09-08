"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-ink-700 bg-canvas-inset px-2.5 text-sm text-ink-100 placeholder:text-ink-500",
        "outline-none transition-colors focus:border-ai",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
