import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/format";
import Link from "next/link";
import { Activity } from "lucide-react";
import type { ActivityEvent } from "@/lib/dashboard/activity-feed";

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Aktivitas Terbaru</CardTitle>
      </CardHeader>
      <CardContent className={events.length === 0 ? "py-5" : undefined}>
        {events.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
              <Activity size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Belum ada aktivitas hari ini
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Persetujuan cuti, penggajian, dan pendaftaran baru akan muncul di sini.
              </p>
            </div>
          </div>
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
      </CardContent>
    </Card>
  );
}
