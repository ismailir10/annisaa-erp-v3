"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";

interface DataTableRowActionsProps {
  onView?: () => void;
  onEdit?: () => void;
  onDeactivate?: () => void;
  onActivate?: () => void;
  isActive?: boolean;
  /** Extra menu items rendered before deactivate */
  extraActions?: { label: string; icon?: React.ReactNode; onClick: () => void; destructive?: boolean }[];
}

export function DataTableRowActions({
  onView,
  onEdit,
  onDeactivate,
  onActivate,
  isActive = true,
  extraActions,
}: DataTableRowActionsProps) {
  const hasDropdownItems = onEdit || onDeactivate || onActivate || (extraActions && extraActions.length > 0);

  return (
    <div className="flex items-center gap-1">
      {onView && (
        <Button size="sm" variant="ghost" onClick={onView} className="h-8 px-2">
          <Eye size={14} className="mr-1" />
          <span className="text-xs">Lihat</span>
        </Button>
      )}

      {hasDropdownItems && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}>
            <MoreHorizontal size={14} />
            <span className="sr-only">Buka menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil size={14} className="mr-2" />
                Edit
              </DropdownMenuItem>
            )}

            {extraActions?.map((action, i) => (
              <DropdownMenuItem
                key={i}
                onClick={action.onClick}
                className={action.destructive ? "text-destructive focus:text-destructive" : ""}
              >
                {action.icon && <span className="mr-2">{action.icon}</span>}
                {action.label}
              </DropdownMenuItem>
            ))}

            {(onDeactivate || onActivate) && (onEdit || extraActions?.length) && (
              <DropdownMenuSeparator />
            )}

            {isActive && onDeactivate && (
              <DropdownMenuItem onClick={onDeactivate} className="text-destructive focus:text-destructive">
                <PowerOff size={14} className="mr-2" />
                Nonaktifkan
              </DropdownMenuItem>
            )}

            {!isActive && onActivate && (
              <DropdownMenuItem onClick={onActivate}>
                <Power size={14} className="mr-2" />
                Aktifkan
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
