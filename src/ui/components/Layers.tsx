// Capa de fondo (scrim) y modales de la consola: ficha, registro y manifiesto. Del prototipo.
import { useEffect } from "react";
import { useConsole } from "@/application/state/ConsoleContext";
import { Drawer } from "@/ui/components/Drawer";
import { RegisterModal } from "@/ui/components/RegisterModal";
import { ManifestModal } from "@/ui/components/ManifestModal";

export function Layers() {
  const c = useConsole();
  const alguna = !!c.detailId || c.regOpen || !!c.manifestId;
  const cerrar = () => {
    c.closeDetails();
    c.closeRegistration();
    c.closeManifest();
  };
  useEffect(() => {
    if (!alguna) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alguna]);
  return (
    <>
      <div className={`scrim ${alguna ? "on" : ""}`} onClick={cerrar} />
      <Drawer />
      <RegisterModal />
      <ManifestModal />
    </>
  );
}
