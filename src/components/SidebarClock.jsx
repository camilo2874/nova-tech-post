import { useEffect, useState } from "react";

const opcionesFecha = {
  weekday: "long",
  day: "numeric",
  month: "long",
};

export default function SidebarClock() {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fecha = ahora.toLocaleDateString("es-CO", opcionesFecha);
  const hora = ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="nt-sidebar-clock">
      <div className="nt-sidebar-clock-date">{fecha}</div>
      <div className="nt-sidebar-clock-time">{hora}</div>
    </div>
  );
}
