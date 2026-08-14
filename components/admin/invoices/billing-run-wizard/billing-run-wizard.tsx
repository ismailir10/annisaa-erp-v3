"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AcademicYear } from "./billing-defaults";
import { StepIndicator, type StepIndicatorItem } from "./step-indicator";
import { ScopeStep } from "./step-1-scope";
import { ReviewStep } from "./step-2-review";
import { CommitStep } from "./step-3-commit";
import type { WizardStep } from "./types";

// Billing Run wizard shell (bulk invoice wizard arc, Cycle B1 —
// docs/cycles/2026-08-14-billing-run-wizard.md, Task T8). Steps 2 (Tinjau)
// and 3 (Komit) are Task T9's — the shell's step routing, focus management
// and step indicator are unchanged from T8; only the step bodies below moved
// from placeholders to the real components.

const STEPS: StepIndicatorItem[] = [
  { step: 1, label: "Cakupan" },
  { step: 2, label: "Tinjau" },
  { step: 3, label: "Komit" },
];

const STEP_TITLES: Record<WizardStep, string> = {
  1: "Langkah 1: Cakupan",
  2: "Langkah 2: Tinjau",
  3: "Langkah 3: Komit",
};

const STEP_DESCRIPTIONS: Record<WizardStep, string> = {
  1: "Tentukan periode, kelas, dan siswa yang akan ditagih.",
  2: "Tinjau baris tagihan per siswa sebelum dikomit.",
  3: "Komit draf menjadi tagihan resmi.",
};

export function BillingRunWizard({
  open,
  onOpenChange,
  resumeRunId,
  years,
  onDraftChanged,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when opened from the resumable-draft banner — jumps straight past step 1. */
  resumeRunId: string | null;
  years: AcademicYear[];
  onDraftChanged?: () => void;
  /** Fired once step 3 has nothing left to commit — the caller refreshes the
   *  invoice list (and its stats + draft banner) before the wizard closes. */
  onCommitted?: () => void;
}) {
  const isMobile = useIsMobile();
  const [step, setStep] = useState<WizardStep>(1);
  const [billingRunId, setBillingRunId] = useState<string | null>(null);

  // (Re)initialize whenever the wizard opens. Resuming a draft (from the
  // page-level banner, which is itself populated by GET
  // /api/billing-runs?status=DRAFT — see invoices-client.tsx) jumps to step
  // 2's placeholder with that run's id already carrying the persisted
  // scope; a fresh open always starts at step 1 with no id.
  /* eslint-disable react-hooks/set-state-in-effect -- resetting the
     wizard's step/run-id to match the caller's open/resume intent is the
     whole point of this effect, not an external-system sync. */
  useEffect(() => {
    if (!open) return;
    if (resumeRunId) {
      setBillingRunId(resumeRunId);
      setStep(2);
    } else {
      setBillingRunId(null);
      setStep(1);
    }
  }, [open, resumeRunId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Focus movement between steps (better-accessibility): each step
  // transition moves focus to that step's heading so a screen-reader user
  // gets an explicit "Langkah N: ..." announcement instead of focus
  // silently staying on the button that triggered the transition.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
  }, [step, open]);

  function handleAdvance(runId: string) {
    setBillingRunId(runId);
    setStep(2);
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleReviewAdvance() {
    setStep(3);
  }

  function handleCommitted() {
    onCommitted?.();
    handleClose();
  }

  const body = (
    <>
      <StepIndicator steps={STEPS} current={step} />
      <div className="mt-section">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-h2 font-medium outline-none"
        >
          {STEP_TITLES[step]}
        </h3>
        <p className="mb-4 text-small text-muted-foreground">{STEP_DESCRIPTIONS[step]}</p>

        {step === 1 && (
          <ScopeStep
            years={years}
            onAdvance={handleAdvance}
            onCancel={handleClose}
            notifyDraftChanged={onDraftChanged}
          />
        )}
        {step === 2 && billingRunId && (
          <ReviewStep runId={billingRunId} onAdvance={handleReviewAdvance} onClose={handleClose} />
        )}
        {step === 3 && billingRunId && (
          <CommitStep runId={billingRunId} onClose={handleClose} onCommitted={handleCommitted} />
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Buat Tagihan (Wizard)</SheetTitle>
            <SheetDescription>
              Tentukan cakupan, tinjau baris tagihan, lalu komit.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buat Tagihan (Wizard)</DialogTitle>
          <DialogDescription>
            Tentukan cakupan, tinjau baris tagihan, lalu komit.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
