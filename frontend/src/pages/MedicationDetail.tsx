import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Power, PowerOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DoseInput } from "@/components/DoseInput";
import {
  medicationsApi, therapiesApi, stockApi,
  type Medication, type Therapy, type StockEntry, type StockLevel,
} from "@/api/client";
import { toast } from "@/components/ui/use-toast";

function formatDate(isoOrDate: string): string {
  return new Date(isoOrDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

const FRACTIONS = [
  { value: 1 / 4, label: "1/4" },
  { value: 1 / 3, label: "1/3" },
  { value: 1 / 2, label: "1/2" },
  { value: 2 / 3, label: "2/3" },
  { value: 3 / 4, label: "3/4" },
];

function formatDose(decimal: number): string {
  const whole = Math.floor(decimal);
  const frac = decimal - whole;
  const match = FRACTIONS.find((f) => Math.abs(frac - f.value) < 0.02);
  if (!match || frac < 0.01) return whole > 0 ? String(whole) : decimal.toFixed(2);
  return whole > 0 ? `${whole} + ${match.label}` : match.label;
}

function estimatedEndDate(daysRemaining: number | null): string {
  if (daysRemaining === null || daysRemaining <= 0) return "—";
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(daysRemaining));
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export function MedicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const medId = parseInt(id!);

  const [medication, setMedication] = useState<Medication | null>(null);
  const [therapies, setTherapies] = useState<Therapy[]>([]);
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [level, setLevel] = useState<StockLevel | null>(null);

  const [therapyDialogOpen, setTherapyDialogOpen] = useState(false);
  const [editingTherapy, setEditingTherapy] = useState<Therapy | null>(null);
  const [therapyForm, setTherapyForm] = useState({
    dose_per_intake: 1,
    intakes_per_day: 1,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    is_active: true,
    notes: "",
  });

  const [stockAddOpen, setStockAddOpen] = useState(false);
  const [stockForm, setStockForm] = useState({ quantity: 0, notes: "", sign: 1 });

  const [stockEditOpen, setStockEditOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<StockEntry | null>(null);
  const [stockEditForm, setStockEditForm] = useState({ quantity: 0, notes: "", sign: 1 });

  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    try {
      const [medResp, therapiesResp, entriesResp, levelResp] = await Promise.all([
        medicationsApi.get(medId),
        therapiesApi.list(medId),
        stockApi.entries(medId),
        stockApi.level(medId),
      ]);
      setMedication(medResp.data);
      setTherapies(therapiesResp.data);
      setEntries(entriesResp.data);
      setLevel(levelResp.data);
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i dati" });
    }
  };

  useEffect(() => { fetchAll(); }, [medId]);

  // ── Therapy handlers ──────────────────────────────────────────────────────

  const openAddTherapy = () => {
    setEditingTherapy(null);
    setTherapyForm({
      dose_per_intake: 1,
      intakes_per_day: 1,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: "",
      is_active: true,
      notes: "",
    });
    setTherapyDialogOpen(true);
  };

  const openEditTherapy = (t: Therapy) => {
    setEditingTherapy(t);
    setTherapyForm({
      dose_per_intake: Number(t.dose_per_intake),
      intakes_per_day: t.intakes_per_day,
      start_date: t.start_date,
      end_date: t.end_date ?? "",
      is_active: t.is_active,
      notes: t.notes ?? "",
    });
    setTherapyDialogOpen(true);
  };

  const handleSaveTherapy = async () => {
    setSaving(true);
    try {
      const data = {
        medication_id: medId,
        dose_per_intake: therapyForm.dose_per_intake,
        intakes_per_day: therapyForm.intakes_per_day,
        start_date: therapyForm.start_date,
        end_date: therapyForm.end_date || null,
        is_active: therapyForm.is_active,
        notes: therapyForm.notes || null,
      };
      if (editingTherapy) {
        await therapiesApi.update(editingTherapy.id, data);
        toast({ title: "Terapia aggiornata" });
      } else {
        await therapiesApi.create(data as any);
        toast({ title: "Terapia aggiunta" });
      }
      setTherapyDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Errore", description: err.response?.data?.detail ?? "Errore" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTherapy = async (t: Therapy) => {
    try {
      if (t.is_active) {
        await therapiesApi.deactivate(t.id);
      } else {
        await therapiesApi.activate(t.id);
      }
      fetchAll();
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile aggiornare la terapia" });
    }
  };

  const handleDeleteTherapy = async (t: Therapy) => {
    if (!confirm("Eliminare questa terapia?")) return;
    try {
      await therapiesApi.delete(t.id);
      toast({ title: "Terapia eliminata" });
      fetchAll();
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile eliminare la terapia" });
    }
  };

  // ── Stock handlers ────────────────────────────────────────────────────────

  const handleAddStock = async () => {
    setSaving(true);
    try {
      await stockApi.addEntry({ medication_id: medId, quantity: stockForm.quantity * stockForm.sign, notes: stockForm.notes || undefined });
      toast({ title: "Scorte aggiornate" });
      setStockAddOpen(false);
      setStockForm({ quantity: 0, notes: "", sign: 1 });
      fetchAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Errore", description: err.response?.data?.detail ?? "Errore" });
    } finally {
      setSaving(false);
    }
  };

  const openEditEntry = (entry: StockEntry) => {
    setEditingEntry(entry);
    const q = Number(entry.quantity);
    setStockEditForm({ quantity: Math.abs(q), notes: entry.notes ?? "", sign: q < 0 ? -1 : 1 });
    setStockEditOpen(true);
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;
    setSaving(true);
    try {
      await stockApi.updateEntry(editingEntry.id, {
        quantity: stockEditForm.quantity * stockEditForm.sign,
        notes: stockEditForm.notes || null,
      });
      toast({ title: "Voce aggiornata" });
      setStockEditOpen(false);
      setEditingEntry(null);
      fetchAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Errore", description: err.response?.data?.detail ?? "Errore" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entry: StockEntry) => {
    if (!confirm("Eliminare questa voce?")) return;
    try {
      await stockApi.deleteEntry(entry.id);
      fetchAll();
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile eliminare la voce" });
    }
  };

  if (!medication) {
    return <div className="p-6 text-muted-foreground">Caricamento...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{medication.name}</h1>
        <Badge variant="secondary">{medication.unit}</Badge>
      </div>

      {level && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Rimanenti", value: `${Number(level.remaining_quantity).toFixed(2)} ${medication.unit}` },
            { label: "Giorni rimanenti", value: level.days_remaining != null ? `${Number(level.days_remaining).toFixed(1)}` : "—" },
            { label: "Fine scorte stimata", value: estimatedEndDate(level.days_remaining) },
            { label: "Dose giornaliera", value: level.daily_dose > 0 ? `${Number(level.daily_dose).toFixed(2)} ${medication.unit}/g` : "—" },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Therapies */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Terapie</CardTitle>
            <Button size="sm" onClick={openAddTherapy}>
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {therapies.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nessuna terapia registrata</p>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="md:hidden divide-y">
                {therapies.map((t) => (
                  <div key={t.id} className={`px-4 py-3 ${!t.is_active ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant={t.is_active ? "success" : "secondary"} className="text-xs">
                        {t.is_active ? "Attiva" : "Inattiva"}
                      </Badge>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleTherapy(t)}>
                          {t.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditTherapy(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteTherapy(t)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="font-semibold">
                      {formatDose(Number(t.dose_per_intake))} {medication.unit} × {t.intakes_per_day}x/giorno
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Dal {t.start_date}{t.end_date ? ` al ${t.end_date}` : " · senza scadenza"}
                    </p>
                    {t.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{t.notes}</p>}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Dose</TableHead>
                    <TableHead>Somm./giorno</TableHead>
                    <TableHead>Inizio</TableHead>
                    <TableHead>Fine</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {therapies.map((t) => (
                    <TableRow key={t.id} className={!t.is_active ? "opacity-50" : ""}>
                      <TableCell>{formatDose(Number(t.dose_per_intake))} {medication.unit}</TableCell>
                      <TableCell>{t.intakes_per_day}x</TableCell>
                      <TableCell>{t.start_date}</TableCell>
                      <TableCell>{t.end_date ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={t.is_active ? "success" : "secondary"}>
                          {t.is_active ? "Attiva" : "Inattiva"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleToggleTherapy(t)}>
                            {t.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditTherapy(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTherapy(t)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stock history */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Storico scorte</CardTitle>
            <Button size="sm" onClick={() => setStockAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi scorte
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nessuna scorta registrata</p>
          ) : (
            <>
              {/* Mobile: list */}
              <div className="md:hidden divide-y">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold ${Number(entry.quantity) < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                        {Number(entry.quantity) >= 0 ? "+" : ""}{Number(entry.quantity).toFixed(2)} {medication.unit}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(entry.created_at)}</p>
                      {entry.notes && <p className="text-xs text-muted-foreground italic">{entry.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditEntry(entry)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteEntry(entry)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Quantità</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDate(entry.created_at)}</TableCell>
                      <TableCell>+{Number(entry.quantity).toFixed(2)} {medication.unit}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.notes ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditEntry(entry)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteEntry(entry)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Therapy Dialog */}
      <Dialog open={therapyDialogOpen} onOpenChange={setTherapyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTherapy ? "Modifica terapia" : "Aggiungi terapia"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Dose per somministrazione ({medication.unit})</Label>
              <DoseInput
                value={therapyForm.dose_per_intake}
                onChange={(v) => setTherapyForm({ ...therapyForm, dose_per_intake: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Somministrazioni al giorno</Label>
              <Input
                type="number"
                min={1}
                value={therapyForm.intakes_per_day}
                onChange={(e) => setTherapyForm({ ...therapyForm, intakes_per_day: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Data inizio</Label>
              <Input
                type="date"
                value={therapyForm.start_date}
                onChange={(e) => setTherapyForm({ ...therapyForm, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Data fine (opzionale)</Label>
              <Input
                type="date"
                value={therapyForm.end_date}
                onChange={(e) => setTherapyForm({ ...therapyForm, end_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Note (opzionale)</Label>
              <Input
                value={therapyForm.notes}
                onChange={(e) => setTherapyForm({ ...therapyForm, notes: e.target.value })}
                placeholder="note sulla terapia"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTherapyDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSaveTherapy} disabled={saving || therapyForm.dose_per_intake <= 0}>
              {saving ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Add Dialog */}
      <Dialog open={stockAddOpen} onOpenChange={setStockAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiorna scorte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${stockForm.sign === 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  onClick={() => setStockForm({ ...stockForm, sign: 1 })}
                >
                  + Carico
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${stockForm.sign === -1 ? "bg-destructive text-destructive-foreground" : "hover:bg-muted"}`}
                  onClick={() => setStockForm({ ...stockForm, sign: -1 })}
                >
                  − Scarico
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quantità ({medication.unit})</Label>
              <DoseInput
                value={stockForm.quantity}
                onChange={(v) => setStockForm({ ...stockForm, quantity: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Note (opzionale)</Label>
              <Input
                value={stockForm.notes}
                onChange={(e) => setStockForm({ ...stockForm, notes: e.target.value })}
                placeholder={stockForm.sign === 1 ? "es. Comprata nuova scatola" : "es. Correzione errore"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockAddOpen(false)}>Annulla</Button>
            <Button onClick={handleAddStock} disabled={saving || stockForm.quantity <= 0}>
              {saving ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Edit Dialog */}
      <Dialog open={stockEditOpen} onOpenChange={setStockEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica voce scorte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${stockEditForm.sign === 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  onClick={() => setStockEditForm({ ...stockEditForm, sign: 1 })}
                >
                  + Carico
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${stockEditForm.sign === -1 ? "bg-destructive text-destructive-foreground" : "hover:bg-muted"}`}
                  onClick={() => setStockEditForm({ ...stockEditForm, sign: -1 })}
                >
                  − Scarico
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quantità ({medication.unit})</Label>
              <DoseInput
                value={stockEditForm.quantity}
                onChange={(v) => setStockEditForm({ ...stockEditForm, quantity: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Note (opzionale)</Label>
              <Input
                value={stockEditForm.notes}
                onChange={(e) => setStockEditForm({ ...stockEditForm, notes: e.target.value })}
                placeholder="es. Correzione errore"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockEditOpen(false)}>Annulla</Button>
            <Button onClick={handleUpdateEntry} disabled={saving || stockEditForm.quantity <= 0}>
              {saving ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
