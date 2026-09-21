"use client";

import { motion, useReducedMotion } from "motion/react";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_DOT = {
  live: "bg-status-live",
  warning: "bg-status-warning",
  error: "bg-status-error",
} as const;

export function GoodComponent({ status }: { status: keyof typeof STATUS_DOT }) {
  const reduced = useReducedMotion();

  return (
    <Card className="rounded-lg border-border bg-card">
      <CardContent className="flex items-center gap-3 p-4">
        <Activity aria-hidden className="size-4 text-muted-foreground" />
        <span aria-hidden className={cn("size-2 rounded-lg", STATUS_DOT[status])} />
        <Badge variant="secondary">{status}</Badge>
        <motion.span
          animate={reduced ? undefined : { opacity: 1 }}
          className="text-sm text-muted-foreground"
        >
          updated just now
        </motion.span>
      </CardContent>
    </Card>
  );
}
