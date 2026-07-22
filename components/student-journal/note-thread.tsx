"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDateShort, formatTime } from "@/lib/format";
import {
  roleLabel,
  getNoteAuthorInitials,
  getNoteAuthorLabel,
} from "@/lib/student-journal/note-display";

type Note = {
  id: string;
  date: string;
  authorRole: string;
  authorUserId?: string;
  authorName?: string;
  body: string;
  createdAt: string | Date;
};

function toIso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

type NoteThreadProps = {
  notes: Note[];
  onEdit?: (noteId: string, note: { date: string; body: string }) => void;
  onDelete?: (noteId: string) => void;
  canEdit?: (note: Note) => boolean;
};

export function NoteThread({
  notes,
  onEdit,
  onDelete,
  canEdit = () => false,
}: NoteThreadProps) {
  if (notes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Belum ada catatan.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => {
        const editable = canEdit(note) && (onEdit || onDelete);
        return (
          <div
            key={note.id}
            className="rounded-lg border border-border bg-card p-3 space-y-1.5"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Avatar size="sm">
                <AvatarFallback>
                  {getNoteAuthorInitials(note.authorName, note.authorRole)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-foreground">
                {getNoteAuthorLabel(note.authorName, note.authorRole)}
              </span>
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                {roleLabel(note.authorRole)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDateShort(note.date)} &middot; {formatTime(toIso(note.createdAt))}
              </span>
              {editable && (
                <div className="ml-auto flex items-center gap-1">
                  {onEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit catatan"
                      onClick={() =>
                        onEdit(note.id, { date: note.date, body: note.body })
                      }
                    >
                      <Pencil />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Hapus catatan"
                      onClick={() => onDelete(note.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {note.body}
            </p>
          </div>
        );
      })}
    </div>
  );
}
