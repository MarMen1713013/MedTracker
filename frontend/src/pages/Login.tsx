import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authApi } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

export function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const resp = await authApi.login(username, password);
        localStorage.setItem("token", resp.data.access_token);
        navigate("/");
      } else {
        await authApi.register(username, password);
        // Auto login after register
        const resp = await authApi.login(username, password);
        localStorage.setItem("token", resp.data.access_token);
        navigate("/");
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: err.response?.data?.detail ?? "Credenziali non valide",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Pill className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">MedTracker</CardTitle>
          <CardDescription>
            {mode === "login" ? "Accedi al tuo account" : "Crea un nuovo account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : mode === "login" ? "Accedi" : "Registrati"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {mode === "login" ? (
              <>
                Nessun account?{" "}
                <button
                  className="text-primary underline"
                  onClick={() => setMode("register")}
                  type="button"
                >
                  Registrati
                </button>
              </>
            ) : (
              <>
                Hai già un account?{" "}
                <button
                  className="text-primary underline"
                  onClick={() => setMode("login")}
                  type="button"
                >
                  Accedi
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
