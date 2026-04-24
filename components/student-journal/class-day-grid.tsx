"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Indicator = {
  id: string;
  label: string;
  order: number;
};

type Category = {
  id: string;
  name: string;
  order: number;
  indicators: Indicator[];
};

type Student = {
  id: string;
  name: string;
  nickname: string | null;
};

type ClassDayGridProps = {
  students: Student[];
  categories: Category[];
  /** state[studentId][indicatorId] = checked */
  state: Record<string, Record<string, boolean>>;
  onToggle: (studentId: string, indicatorId: string) => void;
};

export function ClassDayGrid({ students, categories, state, onToggle }: ClassDayGridProps) {
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  function toggleExpand(studentId: string) {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }

  function countChecked(studentId: string): number {
    const studentState = state[studentId] ?? {};
    return Object.values(studentState).filter(Boolean).length;
  }

  const totalIndicators = categories.reduce((sum, cat) => sum + cat.indicators.length, 0);

  return (
    <div className="space-y-2">
      {students.map((student, i) => {
        const isExpanded = expandedStudents.has(student.id);
        const checkedCount = countChecked(student.id);

        return (
          <motion.div
            key={student.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Student header — tap to expand */}
            <button
              onClick={() => toggleExpand(student.id)}
              className="w-full flex items-center justify-between p-3.5 text-left"
              aria-expanded={isExpanded}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                    checkedCount === totalIndicators && totalIndicators > 0
                      ? "bg-primary"
                      : "bg-muted-foreground/40"
                  }`}
                >
                  {checkedCount === totalIndicators && totalIndicators > 0 ? (
                    <Check size={14} />
                  ) : (
                    <span>{student.name[0]}</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{student.name}</p>
                  {student.nickname && (
                    <p className="text-xs text-muted-foreground">{student.nickname}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {checkedCount}/{totalIndicators}
                </span>
                {isExpanded ? (
                  <ChevronUp size={16} className="text-muted-foreground" />
                ) : (
                  <ChevronDown size={16} className="text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Expanded indicator checklist */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key="indicators"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border px-3.5 pb-3 pt-2 space-y-3">
                    {categories.map((category) => (
                      <div key={category.id}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          {category.name}
                        </p>
                        <div className="space-y-1">
                          {category.indicators.map((indicator) => {
                            const isChecked = state[student.id]?.[indicator.id] ?? false;
                            return (
                              <button
                                key={indicator.id}
                                onClick={() => onToggle(student.id, indicator.id)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors min-h-[44px] ${
                                  isChecked
                                    ? "bg-primary/10 border-primary text-primary"
                                    : "border-border text-foreground hover:border-primary/30"
                                }`}
                              >
                                <div
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                    isChecked
                                      ? "bg-primary border-primary"
                                      : "border-border"
                                  }`}
                                >
                                  {isChecked && <Check size={11} className="text-white" />}
                                </div>
                                <span className="text-xs leading-snug">{indicator.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
