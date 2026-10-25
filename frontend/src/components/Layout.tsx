import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Pill, LayoutDashboard, Settings, Database, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/medications", label: "Farmaci", icon: Pill, end: false },
  { to: "/backup", label: "Backup", icon: Database, end: false },
  { to: "/settings", label: "Impostazioni", icon: Settings, end: false },
];

export function Layout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">

      {/* Sidebar — desktop only */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-muted/30 md:flex print:hidden">
        <div className="flex items-center gap-2 px-4 py-5 border-b">
          <Pill className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">MedTracker</span>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Esci
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0 print:overflow-visible print:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t bg-background md:hidden print:hidden">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5px]")} />
                {label}
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={handleLogout}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Esci
        </button>
      </nav>

    </div>
  );
}
