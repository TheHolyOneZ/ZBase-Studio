import { clsx } from "clsx";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  danger?: boolean;
  size?: "sm" | "md";
}

export default function IconButton({ label, danger, size = "md", className, children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={clsx(
        "flex items-center justify-center rounded-[var(--r-sm)] transition-all duration-150 cursor-default",
        size === "sm" && "w-6 h-6",
        size === "md" && "w-7 h-7",
        danger
          ? "text-[var(--fg-subtle)] hover:bg-[rgba(248,113,113,0.15)] hover:text-[var(--danger)]"
          : "text-[var(--fg-subtle)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-muted)]",
        className,
      )}
    >
      {children}
    </button>
  );
}
