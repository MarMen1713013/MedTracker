import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MedicationCard } from "@/components/MedicationCard";
import { stockApi, type StockLevel } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

export function Dashboard() {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchLevels} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => navigate("/medications")}>
            <Plus className="h-4 w-4 mr-2" />
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
    </div>
  );
}
