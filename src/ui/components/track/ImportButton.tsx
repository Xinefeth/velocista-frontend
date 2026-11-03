// Botón «Importar JSON»: abre el selector de archivos y entrega el archivo elegido. No lee ni interpreta
// nada aquí (lo hace `useTrackImport`); el contenido nunca se muestra como HTML.
import { useRef } from "react";

export function ImportButton({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="sb"
        title="Abrir un archivo de pista: JSON de la API o del prototipo (v2)"
        onClick={() => input.current?.click()}
      >
        Importar JSON
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="trk-sr"
        tabIndex={-1}
        aria-label="Archivo de pista (JSON)"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Se limpia para poder elegir el mismo archivo otra vez.
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
