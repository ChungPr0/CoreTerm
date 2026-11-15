import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type AlertKind = "error" | "warn" | "info" | "success";

interface AlertItem {
  id: string;
  kind: AlertKind;
  message: string;
  duration: number;
  resetSeq: number;
}

interface AlertApi {
  show: (kind: AlertKind, message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  warn: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
}

const DEFAULT_DURATION_MS = 5000;
const MAX_ALERTS = 4;

const AlertContext = createContext<AlertApi | null>(null);

const KIND_STYLES: Record<
  AlertKind,
  { border: string; icon: React.ReactNode; bar: string }
> = {
  error: {
    border: "border-rose-500/45 bg-slate-900/95 text-rose-100",
    icon: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />,
    bar: "bg-rose-500/80",
  },
  warn: {
    border: "border-amber-500/45 bg-slate-900/95 text-amber-100",
    icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
    bar: "bg-amber-400/80",
  },
  success: {
    border: "border-emerald-500/45 bg-slate-900/95 text-emerald-100",
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
    bar: "bg-emerald-500/80",
  },
  info: {
    border: "border-sky-500/45 bg-slate-900/95 text-sky-100",
    icon: <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />,
    bar: "bg-sky-400/80",
  },
};

const AlertCard: React.FC<{
  item: AlertItem;
  onDismiss: (id: string) => void;
}> = ({ item, onDismiss }) => {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(item.duration);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    remainingRef.current = item.duration;
  }, [item.duration, item.resetSeq]);

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      onDismiss(item.id);
    }, remainingRef.current);

    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current)
      );
    };
  }, [item.id, item.resetSeq, paused, onDismiss]);

  const style = KIND_STYLES[item.kind];

  return (
    <div
      role="alert"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto relative overflow-hidden rounded-lg border shadow-2xl backdrop-blur-md px-3 py-2.5 text-xs flex items-start gap-2.5 ${style.border}`}
    >
      {style.icon}
      <p className="flex-1 min-w-0 leading-relaxed break-words select-text">
        {item.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="p-0.5 rounded text-slate-400 hover:text-white shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div
        key={item.resetSeq}
        style={{
          transformOrigin: "left center",
          animation: `alert-progress ${item.duration}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
        className={`absolute bottom-0 left-0 right-0 h-[2px] ${style.bar}`}
      />
    </div>
  );
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [items, setItems] = useState<AlertItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (kind: AlertKind, rawMsg: string, durationMs = DEFAULT_DURATION_MS) => {
      const message = rawMsg.trim();
      if (!message) return;

      setItems((prev) => {
        const existingIdx = prev.findIndex(
          (x) => x.kind === kind && x.message === message
        );
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = {
            ...next[existingIdx],
            duration: durationMs,
            resetSeq: next[existingIdx].resetSeq + 1,
          };
          return next;
        }

        const nextItem: AlertItem = {
          id: crypto.randomUUID(),
          kind,
          message,
          duration: durationMs,
          resetSeq: 1,
        };
        const trimmed =
          prev.length >= MAX_ALERTS ? prev.slice(prev.length - MAX_ALERTS + 1) : prev;
        return [...trimmed, nextItem];
      });
    },
    []
  );

  const api = useMemo<AlertApi>(
    () => ({
      show,
      error: (msg, ms) => show("error", msg, ms),
      warn: (msg, ms) => show("warn", msg, ms),
      info: (msg, ms) => show("info", msg, ms),
      success: (msg, ms) => show("success", msg, ms),
    }),
    [show]
  );

  return (
    <AlertContext.Provider value={api}>
      {children}
      {items.length > 0 && (
        <div className="fixed top-11 right-3 z-[120] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-1.5rem)] pointer-events-none select-none">
          {items.map((item) => (
            <AlertCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </AlertContext.Provider>
  );
};

export function useAlert(): AlertApi {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error("useAlert must be used within AlertProvider");
  }
  return ctx;
}
