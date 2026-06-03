import { Database } from "lucide-react";
import { motion } from "motion/react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center"
    >
      <div style={{ color: "var(--fg-subtle)" }}>
        {icon ?? <Database size={40} strokeWidth={1} />}
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--fg-0)" }}>{title}</p>
        {description && (
          <p className="text-xs mt-1" style={{ color: "var(--fg-subtle)" }}>{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}
