import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveStatusProps = {
  state: "saving" | "saved" | "error";
  message?: string;
  className?: string;
};

const defaultMessage = {
  saving: "Menyimpan…",
  saved: "Tersimpan",
  error: "Gagal menyimpan",
};

/** Keep mounted as state changes so screen readers can announce save feedback. */
export function SaveStatus({ state, message, className }: SaveStatusProps) {
  const Icon = state === "saving" ? LoaderCircle : state === "saved" ? CheckCircle2 : AlertCircle;
  return (
    <p
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 text-small text-muted-foreground",
        state === "saved" && "text-status-present-text",
        state === "error" && "text-destructive",
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn("size-4", state === "saving" && "animate-spin motion-reduce:animate-none")} />
      <span>{message ?? defaultMessage[state]}</span>
    </p>
  );
}
