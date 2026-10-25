import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, ChevronRight, Bell, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  medicationsApi,
  type ActiveIngredientSuggestion,
  type Medication,
} from "@/api/client";
import { toast } from "@/components/ui/use-toast";

interface MedFormData {
  name: string;
  active_ingredient: string;
  unit: string;
  notification_threshold_days: number;
  notes: string;
}

const emptyForm: MedFormData = {
  name: "",
  active_ingredient: "",
  unit: "compresse",
  notification_threshold_days: 10,
  notes: "",
};

export function Medications() {
  const navigate = useNavigate();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [form, setForm] = useState<MedFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [lookingUpIngredient, setLookingUpIngredient] = useState(false);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<ActiveIngredientSuggestion[]>([]);

  const fetchMedications = async () => {
    setLoading(true);
    try {
      const resp = await medicationsApi.list();
      setMedications(resp.data);
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i farmaci" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMedications(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setIngredientSuggestions([]);
    setDialogOpen(true);
  };

  const openEdit = (med: Medication, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(med);
    setForm({
      name: med.name,
      active_ingredient: med.active_ingredient ?? "",
      unit: med.unit,
      notification_threshold_days: med.notification_threshold_days,
      notes: med.notes ?? "",
    });
    setIngredientSuggestions([]);
    setDialogOpen(true);
  };

  const handleIngredientLookup = async () => {
    const name = form.name.trim();
    if (name.length < 2) {
      toast({ title: "Inserisci prima il nome del farmaco" });
      return;
    }
    setLookingUpIngredient(true);
    setIngredientSuggestions([]);
    try {
      const resp = await medicationsApi.lookupActiveIngredients(name);
      setIngredientSuggestions(resp.data);
      if (resp.data.length === 0) {
        toast({
          title: "Nessuna corrispondenza negli archivi ufficiali",
          description: "Puoi inserire il principio attivo manualmente.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Ricerca online non disponibile",
        description: err.response?.data?.detail ?? "Inserisci il principio attivo manualmente.",
      });
    } finally {
      setLookingUpIngredient(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        ...form,
        active_ingredient: form.active_ingredient.trim() || null,
        notes: form.notes || null,
      };
      if (editing) {
        await medicationsApi.update(editing.id, data);
        toast({ title: "Farmaco aggiornato" });
      } else {
        await medicationsApi.create(data);
        toast({ title: "Farmaco aggiunto" });
      }
      setDialogOpen(false);
      fetchMedications();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Errore", description: err.response?.data?.detail ?? "Errore nel salvataggio" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (med: Medication, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Eliminare "${med.name}"? Verranno eliminati anche tutte le terapie e le scorte.`)) return;
    try {
      await medicationsApi.delete(med.id);
      toast({ title: "Farmaco eliminato" });
      fetchMedications();
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile eliminare il farmaco" });
    }
  };

  const empty = (
    <div className="p-8 text-center text-muted-foreground">Nessun farmaco registrato</div>
  );

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Farmaci</h1>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Caricamento...</div>
      ) : medications.length === 0 ? empty : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-2">
            {medications.map((med) => (
              <div
                key={med.id}
                className="flex items-center gap-3 bg-card border rounded-xl px-4 py-3 cursor-pointer active:bg-muted/50 transition-colors"
                onClick={() => navigate(`/medications/${med.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{med.name}</p>
                  {med.active_ingredient && (
                    <p className="text-xs text-muted-foreground truncate">{med.active_ingredient}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span>{med.unit}</span>
                    <span className="flex items-center gap-1">
                      <Bell className="h-3 w-3" />
                      {med.notification_threshold_days}g
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => openEdit(med, e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => handleDelete(med, e)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Principio attivo</TableHead>
                    <TableHead>Unità</TableHead>
                    <TableHead>Soglia notifica</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medications.map((med) => (
                    <TableRow key={med.id} className="cursor-pointer" onClick={() => navigate(`/medications/${med.id}`)}>
                      <TableCell className="font-medium">{med.name}</TableCell>
                      <TableCell>{med.active_ingredient ?? "—"}</TableCell>
                      <TableCell>{med.unit}</TableCell>
                      <TableCell>{med.notification_threshold_days} giorni</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={(e) => openEdit(med, e)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => handleDelete(med, e)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/medications/${med.id}`)}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica farmaco" : "Aggiungi farmaco"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setIngredientSuggestions([]);
                }}
                placeholder="es. Tachipirina"
              />
            </div>
            <div className="space-y-2">
              <Label>Principio attivo (opzionale)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.active_ingredient}
                  onChange={(e) => setForm({ ...form, active_ingredient: e.target.value })}
                  placeholder="es. Paracetamolo"
                />
                <Button
                  variant="outline"
                  onClick={handleIngredientLookup}
                  disabled={lookingUpIngredient || form.name.trim().length < 2}
                  title="Cerca negli archivi ufficiali"
                >
                  {lookingUpIngredient ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="sr-only">Cerca negli archivi ufficiali</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Puoi compilarlo manualmente o cercarlo su{" "}
                <a
                  href="https://medicinali.aifa.gov.it/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  AIFA
                </a>{" "}
                per i medicinali umani e nel{" "}
                <a
                  href="https://www.dati.salute.gov.it/it/dataset/farmaci-veterinari/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Ministero della Salute
                </a>{" "}
                per quelli veterinari.
              </p>
              {ingredientSuggestions.length > 0 && (
                <div className="max-h-36 overflow-auto rounded-md border p-1 space-y-1">
                  {ingredientSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.source_name}-${suggestion.product_name}-${suggestion.active_ingredient}`}
                      type="button"
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setForm({ ...form, active_ingredient: suggestion.active_ingredient });
                        setIngredientSuggestions([]);
                      }}
                    >
                      <span className="font-medium">{suggestion.active_ingredient}</span>
                      <span className="block text-xs text-muted-foreground">
                        {suggestion.product_name} · {suggestion.source_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Unità</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="compresse, gocce, ml..." />
            </div>
            <div className="space-y-2">
              <Label>Soglia notifica (giorni)</Label>
              <Input
                type="number"
                min={1}
                value={form.notification_threshold_days}
                onChange={(e) => setForm({ ...form, notification_threshold_days: parseInt(e.target.value) || 10 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Note (opzionale)</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="note aggiuntive" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.unit}>
              {saving ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
