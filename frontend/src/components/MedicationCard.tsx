import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type StockLevel } from "@/api/client";

interface MedicationCardProps {
  level: StockLevel;
  threshold?: number;
}

function getUrgencyColor(daysRemaining: number | null, threshold: number): {
  border: string;
  badge: "success" | "warning" | "danger" | "secondary";
  label: string;
} {
  if (daysRemaining === null) {
    return { border: "border-gray-200", badge: "secondary", label: "Nessuna terapia attiva" };
  }
  const half = threshold / 2;
  if (daysRemaining <= 0) {
    return { border: "border-red-400", badge: "danger", label: "Scorte esaurite" };
  }
  if (daysRemaining <= half) {
    return { border: "border-red-300", badge: "danger", label: `${Math.floor(daysRemaining)} giorni` };
  }
  if (daysRemaining <= threshold) {
    return { border: "border-amber-300", badge: "warning", label: `${Math.floor(daysRemaining)} giorni` };
  }
  return { border: "border-green-300", badge: "success", label: `${Math.floor(daysRemaining)} giorni` };
}

function estimatedEndDate(daysRemaining: number | null): string | null {
  if (daysRemaining === null || daysRemaining <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(daysRemaining));
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export function MedicationCard({ level }: MedicationCardProps) {
  const navigate = useNavigate();
  const { medication, remaining_quantity, days_remaining, daily_dose, therapies_active } = level;
  const threshold = medication.notification_threshold_days;
  const { border, badge, label } = getUrgencyColor(days_remaining, threshold);
  const endDate = estimatedEndDate(days_remaining);

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow border-2 ${border}`}
      onClick={() => navigate(`/medications/${medication.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg leading-tight">{medication.name}</CardTitle>
            {medication.active_ingredient && (
              <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
                {medication.active_ingredient}
              </p>
            )}
          </div>
          <Badge variant={badge} className="shrink-0 mt-0.5">{label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Rimanenti</span>
            <span className="font-medium text-foreground">
              {Number(remaining_quantity).toFixed(2)} {medication.unit}
            </span>
          </div>
          {endDate && (
            <div className="flex justify-between">
              <span>Fine scorte stimata</span>
              <span className="font-medium text-foreground">{endDate}</span>
            </div>
          )}
          {daily_dose > 0 && (
            <div className="flex justify-between">
              <span>Dose giornaliera</span>
              <span className="font-medium text-foreground">
                {Number(daily_dose).toFixed(2)} {medication.unit}/g
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Terapie attive</span>
            <span className="font-medium text-foreground">{therapies_active}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
