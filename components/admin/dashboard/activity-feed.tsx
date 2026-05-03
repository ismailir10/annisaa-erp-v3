import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import Link from "next/link";
import { Activity } from "lucide-react";
import type { ActivityEvent } from "@/lib/dashboard/activity-feed";

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Card className="p-card h-full flex flex-col">
      <h3 className="text-sm font-semibold mb-4">Aktivitas Terbaru</h3>
      {events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Belum ada aktivitas hari ini"
          description="Tindakan seperti persetujuan cuti, penggajian, dan pendaftaran baru akan muncul di sini."
        />
      ) : (
        <ul className="flex-1 space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={event.href}
                className="flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-accent transition-colors"
              >
                <Avatar size="sm">
                  <AvatarFallback>{event.actorInitials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug">
                    <span className="font-medium">{event.actorName}</span>{" "}
                    <span className="text-muted-foreground">{event.verb}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(event.timestamp)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
