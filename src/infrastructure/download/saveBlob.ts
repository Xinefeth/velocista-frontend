// Descarga de archivos en el navegador con Blob + URL de objeto + enlace temporal.
// Sustituye a `window.claude.use('downloads')` y a la ventana de copia del prototipo.

/** Descarga `data` como archivo `filename`. */
export function saveBlob(
  filename: string,
  data: Blob | string,
  type = "application/octet-stream",
): void {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después del clic para que el navegador alcance a iniciar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
