// Vista Trazador de pistas (EN-28): lista, plano editable, inspector, verificación, guardado y exportación.
// Usa solo hooks de application/ (sin imports de infraestructura) y las clases de la consola.
import { useEffect, useMemo, useState } from "react";
import { useTrackDraft } from "@/application/hooks/useTrackDraft";
import { useTrackExport } from "@/application/hooks/useTrackExport";
import { useTracks, type TracksState } from "@/application/hooks/useTracks";
import { TrackEditorProvider, useTrackEditor } from "@/application/state/TrackEditorProvider";
import { EXAMPLES } from "@/domain/track/examples";
import type { ExportKind } from "@/domain/track/files";
import { areaUnavailableReason, measures } from "@/domain/track/measures";
import type { Track } from "@/domain/track/types";
import { Card } from "@/ui/components/Card";
import { DraftBanner } from "@/ui/components/track/DraftBanner";
import { ExportMenu } from "@/ui/components/track/ExportMenu";
import { IssuesPanel } from "@/ui/components/track/IssuesPanel";
import { ProfilePicker } from "@/ui/components/track/ProfilePicker";
import { TrackCanvas } from "@/ui/components/track/TrackCanvas";
import { TrackInspector } from "@/ui/components/track/TrackInspector";
import { TrackList } from "@/ui/components/track/TrackList";
import { TrackToolbar } from "@/ui/components/track/TrackToolbar";
import { describePath } from "@/ui/components/track/fieldLabels";

function SaveStatus() {
  const { saveState } = useTrackEditor();
  if (saveState.status === "idle" || saveState.status === "saving") return null;
  if (saveState.status === "saved")
    return (
      <p className="hint" role="status">
        {saveState.message}
      </p>
    );
  return (
    <div className="hint warn" role="alert">
      <p>{saveState.message}</p>
      {saveState.fields.length > 0 && (
        <ul aria-label="Errores al guardar">
          {saveState.fields.map((f, i) => (
            <li key={`${f.path}-${i}`}>
              {describePath(f.path)}: {f.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrackTracerView({ tracks }: { tracks: TracksState }) {
  const editor = useTrackEditor();
  const exporter = useTrackExport(editor.track, editor.rules);
  const draft = useTrackDraft(editor.store);
  const [message, setMessage] = useState("");
  /** Acción que espera la confirmación de descartar cambios sin guardar. */
  const [pending, setPending] = useState<(() => void) | null>(null);

  // Avisa al cerrar o recargar la página con cambios sin guardar (el navegador pone el texto).
  useEffect(() => {
    if (!editor.dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editor.dirty]);

  /** Ejecuta `action` ya, o pide confirmar si reemplazaría una pista con cambios sin guardar. */
  const guarded = (action: () => void) => () => {
    if (editor.dirty) setPending(() => action);
    else action();
  };
  const openSaved = async (id: number) => {
    const track = await tracks.open(id);
    if (track) {
      editor.openTrack(track);
      setMessage("");
    }
  };
  const openExample = (t: Track) => {
    editor.openTrack(t);
    setMessage("");
  };
  const exportAs = async (kind: ExportKind) => setMessage(await exporter.run(kind));

  const m = useMemo(() => (editor.track ? measures(editor.track) : null), [editor.track]);
  const areaReason = useMemo(
    () => (editor.track ? areaUnavailableReason(editor.track) : null),
    [editor.track],
  );

  const t = editor.track;
  const stateTag = !t ? null : t.id === null ? (
    <span className="tag warn">Sin guardar en la API</span>
  ) : editor.dirty ? (
    <span className="tag warn">Cambios sin guardar</span>
  ) : (
    <span className="tag good">Guardada</span>
  );

  return (
    <section className="view on dv" aria-label="Trazador de pistas">
      <Card className="s8">
        <div className="hd">
          <h2>
            Plano <small>{t ? t.name : "sin pista abierta"}</small>
          </h2>
          {stateTag}
        </div>
        <ProfilePicker
          profiles={editor.profiles.profiles}
          profileId={editor.profileId}
          rules={editor.rules}
          loading={editor.profiles.loading}
          error={editor.profiles.error}
          disabled={!t}
          onSelect={editor.selectProfile}
          onRetry={editor.profiles.reload}
        />
        <TrackToolbar onNew={guarded(editor.newTrack)} />
        {pending && (
          <div className="trk-confirm" role="alertdialog" aria-label="Cambios sin guardar">
            <span>Hay cambios sin guardar. ¿Descartarlos?</span>
            <button
              type="button"
              className="sb red"
              onClick={() => {
                const action = pending;
                setPending(null);
                draft.discardCurrent(); // se descartan los cambios a propósito: el borrador sobra
                action();
              }}
            >
              Descartar y continuar
            </button>
            <button type="button" className="sb" onClick={() => setPending(null)}>
              Cancelar
            </button>
          </div>
        )}
        <DraftBanner
          pending={draft.pending}
          onRecover={(d) => guarded(() => draft.recover(d))()}
          onDiscard={draft.discard}
        />
        <SaveStatus />
        <TrackCanvas />
        {t && t.id !== null && (
          <p className="note">
            La API guarda la última versión que recibe: si abres esta pista en dos pestañas, gana la
            que se guarde al final (no hay aviso de conflicto).
          </p>
        )}
        <ExportMenu disabled={!t} message={message} onExport={exportAs} />
      </Card>
      <div className="s4 stack">
        <Card>
          <div className="hd">
            <h2>Inspector</h2>
          </div>
          <TrackInspector />
        </Card>
        <Card>
          <div className="hd">
            <h2>Verificación</h2>
          </div>
          <IssuesPanel
            analysis={editor.analysis}
            verified={editor.rules !== null}
            issueSel={editor.issueSel}
            onSelect={editor.selectIssue}
            measures={m}
            areaReason={areaReason}
          />
        </Card>
        <Card>
          <div className="hd">
            <h2>
              Pistas <small>{tracks.tracks.length} guardadas</small>
            </h2>
          </div>
          <TrackList
            tracks={tracks.tracks}
            loading={tracks.loading}
            error={tracks.error}
            currentId={t?.id ?? null}
            examples={EXAMPLES}
            onReload={tracks.reload}
            onOpen={(id) => guarded(() => void openSaved(id))()}
            onOpenExample={(ex) => guarded(() => openExample(ex))()}
            onRemove={async (id) => {
              if (await tracks.remove(id)) {
                draft.discardFor(id);
                if (t?.id === id) editor.closeTrack();
              }
            }}
          />
        </Card>
      </div>
    </section>
  );
}

export function TrackTracer() {
  // La lista vive arriba para que guardar desde cualquier lugar (botón o Ctrl+S) la recargue.
  const tracks = useTracks();
  return (
    <TrackEditorProvider onSaved={tracks.reload}>
      <TrackTracerView tracks={tracks} />
    </TrackEditorProvider>
  );
}
