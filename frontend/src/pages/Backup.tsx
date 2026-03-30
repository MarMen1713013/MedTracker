import React, { useEffect, useRef, useState } from "react";
import { Download, Trash2, RotateCcw, Plus, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { backupApi, type BackupFile } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Backup() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const resp = await backupApi.list();
      setBackups(resp.data);
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i backup" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBackups(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await backupApi.create();
      toast({ title: "Backup creato con successo" });
      fetchBackups();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Errore", description: err.response?.data?.detail ?? "Errore nella creazione del backup" });
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (filename: string) => {
    try {
      const resp = await backupApi.download(filename);
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile scaricare il backup" });
    }
  };

  const handleRestore = async (filename: string) => {
    if (!confirm(`Ripristinare dal backup "${filename}"? Tutti i dati attuali verranno sovrascritti.`)) return;
    try {
      await backupApi.restore(filename);
      toast({ title: "Ripristino completato", description: "Il database è stato ripristinato" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Errore", description: err.response?.data?.detail ?? "Errore nel ripristino" });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".sql.gz") && !file.name.endsWith(".sql")) {
      toast({ variant: "destructive", title: "Errore", description: "Il file deve essere un .sql o .sql.gz" });
      return;
    }
    setUploading(true);
    try {
      await backupApi.upload(file);
      toast({ title: "Backup importato", description: file.name });
      fetchBackups();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Errore", description: err.response?.data?.detail ?? "Errore nell'importazione" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Eliminare il backup "${filename}"?`)) return;
    try {
      await backupApi.delete(filename);
      toast({ title: "Backup eliminato" });
      fetchBackups();
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile eliminare il backup" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Backup</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchBackups} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql,.sql.gz"
            className="hidden"
            onChange={handleUpload}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importa backup
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Crea backup
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Backup disponibili</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Caricamento...</div>
          ) : backups.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nessun backup disponibile</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Dimensione</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup) => (
                  <TableRow key={backup.filename}>
                    <TableCell className="font-mono text-sm">{backup.filename}</TableCell>
                    <TableCell>
                      {new Date(backup.created_at).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>{formatBytes(backup.size_bytes)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleDownload(backup.filename)} title="Scarica">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleRestore(backup.filename)} title="Ripristina">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(backup.filename)} title="Elimina">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Note</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• I backup vengono creati automaticamente ogni notte alle 02:00.</p>
          <p>• I file vengono salvati nel volume Docker <code>/backups</code>.</p>
          <p>• I backup contengono solo farmaci e giacenze.</p>
          <p>• L'import accetta file <code>.sql</code> e <code>.sql.gz</code>.</p>
          <p>• I backup vecchi completi vengono importati estraendo solo farmaci e giacenze.</p>
          <p>• Il ripristino sovrascrive farmaci e giacenze correnti e svuota le terapie.</p>
        </CardContent>
      </Card>
    </div>
  );
}
