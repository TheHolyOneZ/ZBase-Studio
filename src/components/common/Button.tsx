import { clsx } from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
}

export default function Button({ variant = "ghost", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 cursor-default select-none rounded-[var(--r-sm)] disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" && "text-xs px-2 py-1",
        size === "md" && "text-sm px-3 py-1.5",
        variant === "primary" && "text-[#0B0F14] bg-[var(--accent)] hover:opacity-90",
        variant === "ghost" && "text-[var(--fg-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]",
        variant === "danger" && "text-[var(--danger)] hover:bg-[rgba(248,113,113,0.12)]",
        className,
      )}
    >
      {children}
    </button>
  );
}
