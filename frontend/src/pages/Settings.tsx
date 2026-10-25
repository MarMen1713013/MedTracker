import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { settingsApi, type Setting } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({
    ntfy_url: "",
    ntfy_topic: "medtracker",
    notification_hour: "8",
    backup_retention_days: "30",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const resp = await settingsApi.list();
      const map: Record<string, string> = {};
      resp.data.forEach((s: Setting) => {
        map[s.key] = s.value ?? "";
      });
      setSettings((prev) => ({ ...prev, ...map }));
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare le impostazioni" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        settingsApi.update("ntfy_url", settings.ntfy_url || null),
        settingsApi.update("ntfy_topic", settings.ntfy_topic || "medtracker"),
        settingsApi.update("notification_hour", settings.notification_hour || "8"),
        settingsApi.update("backup_retention_days", settings.backup_retention_days || "30"),
      ]);
      toast({ title: "Impostazioni salvate" });
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile salvare le impostazioni" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Impostazioni</h1>

      <Card>
        <CardHeader>
          <CardTitle>Notifiche ntfy</CardTitle>
          <CardDescription>
            Configura l'integrazione con ntfy per le notifiche sulle scorte basse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-muted-foreground text-sm">Caricamento...</div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="ntfy_url">URL ntfy</Label>
                <Input
                  id="ntfy_url"
                  value={settings.ntfy_url}
                  onChange={(e) => setSettings({ ...settings, ntfy_url: e.target.value })}
                  placeholder="http://ntfy:80 oppure https://ntfy.sh"
                />
                <p className="text-xs text-muted-foreground">
                  Lascia vuoto per disabilitare le notifiche.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ntfy_topic">Topic ntfy</Label>
                <Input
                  id="ntfy_topic"
                  value={settings.ntfy_topic}
                  onChange={(e) => setSettings({ ...settings, ntfy_topic: e.target.value })}
                  placeholder="medtracker"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notification_hour">Ora notifica giornaliera (0–23)</Label>
                <Input
                  id="notification_hour"
                  type="number"
                  min={0}
                  max={23}
                  value={settings.notification_hour}
                  onChange={(e) => setSettings({ ...settings, notification_hour: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Il cambio dell'ora richiede il riavvio del container backend per avere effetto.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retention backup</CardTitle>
          <CardDescription>
            Elimina automaticamente i backup scaduti dopo il backup giornaliero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground text-sm">Caricamento...</div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="backup_retention_days">Giorni di conservazione (0–3650)</Label>
              <Input
                id="backup_retention_days"
                type="number"
                min={0}
                max={3650}
                value={settings.backup_retention_days}
                onChange={(e) => setSettings({ ...settings, backup_retention_days: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Usa 0 per disabilitare la rimozione automatica. Il backup più recente viene sempre conservato.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving || loading}>
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Salvataggio..." : "Salva impostazioni"}
      </Button>
    </div>
  );
}
