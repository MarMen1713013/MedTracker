import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MedicationCard } from "@/components/MedicationCard";
import { stockApi, type StockLevel } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ReportScope = "therapies" | "stock" | "both";

const REPORT_SCOPE_KEY = "medtracker-report-scope";

function savedReportScope(): ReportScope {
  const value = localStorage.getItem(REPORT_SCOPE_KEY);
  return value === "therapies" || value === "stock" || value === "both" ? value : "both";
}

export function Dashboard() {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [reportScope, setReportScope] = useState<ReportScope>(savedReportScope);
  const navigate = useNavigate();

  const fetchLevels = async () => {
    setLoading(true);
    try {
      const resp = await stockApi.levels();
      setLevels(resp.data);
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i dati" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLevels();
  }, []);

  const openPrintSummary = () => {
    localStorage.setItem(REPORT_SCOPE_KEY, reportScope);
    setPrintDialogOpen(false);
    navigate(`/summary?scope=${reportScope}`);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPrintDialogOpen(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Stampa riepilogo
          </Button>
          <Button variant="outline" size="icon" onClick={fetchLevels} disabled={loading} title="Aggiorna">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="sr-only">Aggiorna</span>
          </Button>
          <Button onClick={() => navigate("/medications")}>
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi farmaco
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 rounded-lg border-2 border-gray-100 bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : levels.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg mb-4">Nessun farmaco registrato</p>
          <Button onClick={() => navigate("/medications")}>
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi il primo farmaco
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {levels.map((level) => (
            <MedicationCard key={level.medication.id} level={level} />
          ))}
        </div>
      )}

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configura il riepilogo</DialogTitle>
            <DialogDescription>
              Scegli quali informazioni includere nell’anteprima da stampare o salvare in PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="report-scope">Contenuto</Label>
            <Select value={reportScope} onValueChange={(value) => setReportScope(value as ReportScope)}>
              <SelectTrigger id="report-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="therapies">Terapie attive</SelectItem>
                <SelectItem value="stock">Disponibilità attuale</SelectItem>
                <SelectItem value="both">Terapie e disponibilità</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {reportScope === "therapies" && "Farmaci in terapia, posologia, periodo e note."}
              {reportScope === "stock" && "Quantità disponibili, consumo e autonomia stimata."}
              {reportScope === "both" && "Un unico documento con terapie attive e stato delle scorte."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>Annulla</Button>
            <Button onClick={openPrintSummary}>Apri anteprima</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
