"use client";

import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/format";

type Note = {
  id: string;
  date: string;
  authorRole: string;
  body: string;
  createdAt: string | Date;
};

const ROLE_LABELS: Record<string, string> = {
  TEACHER: "Guru",
  GUARDIAN: "Orang Tua",
  SCHOOL_ADMIN: "Admin",
  SUPER_ADMIN: "Admin",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

type NoteThreadProps = {
  notes: Note[];
};

export function NoteThread({ notes }: NoteThreadProps) {
  if (notes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Belum ada catatan.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div
          key={note.id}
          className="rounded-lg border border-border bg-card p-3 space-y-1.5"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {roleLabel(note.authorRole)}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {formatDateShort(note.date)}
            </span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
        </div>
      ))}
    </div>
  );
}
