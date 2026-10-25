import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  authApi,
  medicationsApi,
  therapiesApi,
  type Medication,
  type Therapy,
  type User,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";

interface TherapySummaryItem {
  therapy: Therapy;
  medication: Medication;
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isCurrentTherapy(therapy: Therapy, today: string): boolean {
  return (
    therapy.is_active &&
    therapy.start_date <= today &&
    (therapy.end_date === null || therapy.end_date >= today)
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(Number(value));
}

export function TherapySummary() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [therapies, setTherapies] = useState<Therapy[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [generatedAt] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const [userResponse, therapiesResponse, medicationsResponse] = await Promise.all([
          authApi.me(),
          therapiesApi.list(),
          medicationsApi.list(),
        ]);
        if (cancelled) return;
        setUser(userResponse.data);
        setTherapies(therapiesResponse.data);
        setMedications(medicationsResponse.data);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          toast({
            variant: "destructive",
            title: "Errore",
            description: "Impossibile preparare il riepilogo delle terapie.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeTherapies = useMemo<TherapySummaryItem[]>(() => {
    const today = localDateKey(generatedAt);
    const medicationsById = new Map(medications.map((medication) => [medication.id, medication]));

    return therapies
      .filter((therapy) => isCurrentTherapy(therapy, today))
      .map((therapy) => ({ therapy, medication: medicationsById.get(therapy.medication_id) }))
      .filter((item): item is TherapySummaryItem => item.medication !== undefined)
      .sort((left, right) => left.medication.name.localeCompare(right.medication.name, "it"));
  }, [generatedAt, medications, therapies]);

  const generatedDate = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(generatedAt);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" onClick={() => navigate("/medications")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna ai farmaci
        </Button>
        <Button
          onClick={() => window.print()}
          disabled={loading || loadFailed || activeTherapies.length === 0}
        >
          <Printer className="mr-2 h-4 w-4" />
          Stampa / salva PDF
        </Button>
      </div>

      <Card className="print:border-0 print:bg-white print:text-black print:shadow-none">
        <CardContent className="p-5 md:p-8 print:p-0">
          <header className="border-b pb-5">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary print:text-black">
              MedTracker
            </p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">Riepilogo terapie attive</h1>
            <div className="mt-3 grid gap-1 text-sm text-muted-foreground print:text-gray-700 sm:grid-cols-2">
              <p>
                <span className="font-medium text-foreground print:text-black">Utente:</span>{" "}
                {user?.username ?? "—"}
              </p>
              <p className="sm:text-right">
                <span className="font-medium text-foreground print:text-black">Aggiornato al:</span>{" "}
                {generatedDate}
              </p>
            </div>
          </header>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Preparazione del riepilogo...</div>
          ) : loadFailed ? (
            <div className="py-12 text-center">
              <p className="font-medium">Riepilogo non disponibile.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Torna alla pagina Farmaci e riprova tra poco.
              </p>
            </div>
          ) : activeTherapies.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-medium">Nessuna terapia attiva alla data odierna.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sono incluse solo le terapie abilitate e comprese nel relativo periodo di validità.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {activeTherapies.map(({ therapy, medication }, index) => {
                const dailyDose = Number(therapy.dose_per_intake) * therapy.intakes_per_day;
                return (
                  <article
                    key={therapy.id}
                    className="therapy-summary-item grid gap-3 py-5 sm:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary print:border print:border-gray-400 print:bg-white print:text-black">
                      {index + 1}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">{medication.name}</h2>
                      {medication.active_ingredient && (
                        <p className="mt-0.5 text-sm text-muted-foreground print:text-gray-700">
                          Principio attivo: {medication.active_ingredient}
                        </p>
                      )}
                      <p className="mt-2 text-sm">
                        <span className="font-medium">Periodo:</span> dal {formatDate(therapy.start_date)}
                        {therapy.end_date ? ` al ${formatDate(therapy.end_date)}` : ", senza data di fine"}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/60 p-3 print:border print:border-gray-300 print:bg-white">
                      <p className="font-semibold">Posologia</p>
                      <p className="mt-1 text-sm">
                        {formatQuantity(therapy.dose_per_intake)} {medication.unit} per assunzione
                      </p>
                      <p className="text-sm">
                        {therapy.intakes_per_day} {therapy.intakes_per_day === 1 ? "assunzione" : "assunzioni"} al giorno
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        Totale: {formatQuantity(dailyDose)} {medication.unit} al giorno
                      </p>
                      {therapy.notes && (
                        <p className="mt-2 border-t pt-2 text-sm">
                          <span className="font-medium">Note:</span> {therapy.notes}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <footer className="mt-6 border-t pt-4 text-xs text-muted-foreground print:text-gray-600">
            Riepilogo generato da MedTracker. Verificare sempre che i dati coincidano con le indicazioni del professionista sanitario.
          </footer>
        </CardContent>
      </Card>
    </div>
  );
}
