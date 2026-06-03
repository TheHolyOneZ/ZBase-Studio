import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useStore } from "../../store";

export default function ToastHost() {
  const { toasts, removeToast } = useStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[var(--r-md)] text-sm shadow-lg min-w-56 max-w-sm"
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              color: "var(--fg-0)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background:
                  t.type === "success" ? "var(--success)" :
                  t.type === "error" ? "var(--danger)" :
                  t.type === "warning" ? "#E0A53A" :
                  "var(--accent)",
              }}
            />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
