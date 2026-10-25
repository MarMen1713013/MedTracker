import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  authApi,
  medicationsApi,
  stockApi,
  therapiesApi,
  type Medication,
  type StockLevel,
  type Therapy,
  type User,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";

type ReportScope = "therapies" | "stock" | "both";

interface TherapySummaryItem {
  therapy: Therapy;
  medication: Medication;
}

function parseReportScope(value: string | null): ReportScope {
  return value === "therapies" || value === "stock" || value === "both" ? value : "both";
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

function reportTitle(scope: ReportScope): string {
  if (scope === "therapies") return "Riepilogo terapie attive";
  if (scope === "stock") return "Disponibilità attuale dei farmaci";
  return "Riepilogo terapie e disponibilità";
}

function stockAvailability(level: StockLevel, generatedAt: Date): string {
  const remaining = Number(level.remaining_quantity);
  const days = level.days_remaining === null ? null : Number(level.days_remaining);
  if (remaining <= 0) return "Scorte esaurite";
  if (days === null) return "Autonomia non stimabile";

  const wholeDays = Math.max(0, Math.floor(days));
  const estimatedEnd = new Date(generatedAt);
  estimatedEnd.setDate(estimatedEnd.getDate() + wholeDays);
  return `${wholeDays} giorni circa, fino al ${estimatedEnd.toLocaleDateString("it-IT")}`;
}

export function PrintSummary() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scope = parseReportScope(searchParams.get("scope"));
  const includeTherapies = scope === "therapies" || scope === "both";
  const includeStock = scope === "stock" || scope === "both";
  const [user, setUser] = useState<User | null>(null);
  const [therapies, setTherapies] = useState<Therapy[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [generatedAt] = useState(() => new Date());

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${reportTitle(scope)} - MedTracker`;
    return () => {
      document.title = previousTitle;
    };
  }, [scope]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const [userResponse, therapyResponses, stockResponse] = await Promise.all([
          authApi.me(),
          includeTherapies
            ? Promise.all([therapiesApi.list(), medicationsApi.list()])
            : Promise.resolve(null),
          includeStock ? stockApi.levels() : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setUser(userResponse.data);
        if (therapyResponses) {
          setTherapies(therapyResponses[0].data);
          setMedications(therapyResponses[1].data);
        } else {
          setTherapies([]);
          setMedications([]);
        }
        setStockLevels(stockResponse?.data ?? []);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          toast({
            variant: "destructive",
            title: "Errore",
            description: "Impossibile preparare il riepilogo.",
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
  }, [includeStock, includeTherapies]);

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
        <Button variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna alla Dashboard
        </Button>
        <Button
          onClick={() => window.print()}
          disabled={loading || loadFailed}
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
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{reportTitle(scope)}</h1>
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
                Torna alla Dashboard e riprova tra poco.
              </p>
            </div>
          ) : (
            <>
              {includeTherapies && (
                <section className="mt-6">
                  {scope === "both" && <h2 className="text-xl font-semibold">Terapie attive</h2>}
                  {activeTherapies.length === 0 ? (
                    <p className="mt-4 rounded-md border p-4 text-sm text-muted-foreground">
                      Nessuna terapia attiva alla data odierna.
                    </p>
                  ) : (
                    <div className="mt-2 divide-y">
                      {activeTherapies.map(({ therapy, medication }, index) => {
                        const dailyDose = Number(therapy.dose_per_intake) * therapy.intakes_per_day;
                        return (
                          <article
                            key={therapy.id}
                            className="print-summary-item grid gap-3 py-5 sm:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)]"
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary print:border print:border-gray-400 print:bg-white print:text-black">
                              {index + 1}
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">{medication.name}</h3>
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
                                {therapy.intakes_per_day}{" "}
                                {therapy.intakes_per_day === 1 ? "assunzione" : "assunzioni"} al giorno
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
                </section>
              )}

              {includeStock && (
                <section className={includeTherapies ? "mt-8 border-t pt-6" : "mt-6"}>
                  {scope === "both" && <h2 className="text-xl font-semibold">Disponibilità attuale</h2>}
                  {stockLevels.length === 0 ? (
                    <p className="mt-4 rounded-md border p-4 text-sm text-muted-foreground">
                      Nessun farmaco registrato.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-hidden rounded-md border">
                      <div className="hidden grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-4 bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide sm:grid print:grid print:bg-gray-100">
                        <span>Farmaco</span>
                        <span>Quantità e consumo</span>
                        <span>Autonomia</span>
                      </div>
                      <div className="divide-y">
                        {stockLevels.map((level) => (
                          <article
                            key={level.medication.id}
                            className="print-summary-item grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,1fr)] sm:gap-4"
                          >
                            <div>
                              <h3 className="font-semibold">{level.medication.name}</h3>
                              {level.medication.active_ingredient && (
                                <p className="text-xs text-muted-foreground print:text-gray-700">
                                  {level.medication.active_ingredient}
                                </p>
                              )}
                            </div>
                            <div className="text-sm">
                              <p>
                                <span className="font-medium sm:hidden print:hidden">Disponibili: </span>
                                {formatQuantity(level.remaining_quantity)} {level.medication.unit}
                              </p>
                              <p className="text-xs text-muted-foreground print:text-gray-700">
                                Consumo: {formatQuantity(level.daily_dose)} {level.medication.unit}/giorno
                              </p>
                            </div>
                            <div className="text-sm">
                              <p className="font-medium">{stockAvailability(level, generatedAt)}</p>
                              <p className="text-xs text-muted-foreground print:text-gray-700">
                                {level.therapies_active}{" "}
                                {level.therapies_active === 1 ? "terapia attiva" : "terapie attive"}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          <footer className="mt-6 border-t pt-4 text-xs text-muted-foreground print:text-gray-600">
            Riepilogo generato da MedTracker. Le autonomie sono stime basate sulle scorte e sulle terapie registrate; verificare sempre i dati e le indicazioni del professionista sanitario.
          </footer>
        </CardContent>
      </Card>
    </div>
  );
}
