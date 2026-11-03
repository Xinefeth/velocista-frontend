// Vista Trazador de pistas (EN-28): lista, plano editable, inspector, verificación y exportación.
// En esta fase se puede dibujar y editar, pero los cambios todavía NO se guardan en la API.
// Usa solo hooks de application/ (sin imports de infraestructura) y las clases de la consola.
import { useState } from "react";
import { useTrackExport } from "@/application/hooks/useTrackExport";
import { useTracks } from "@/application/hooks/useTracks";
import { TrackEditorProvider, useTrackEditor } from "@/application/state/TrackEditorProvider";
import { EXAMPLES } from "@/domain/track/examples";
import type { ExportKind } from "@/domain/track/files";
import { Card } from "@/ui/components/Card";
import { ExportMenu } from "@/ui/components/track/ExportMenu";
import { IssuesPanel } from "@/ui/components/track/IssuesPanel";
import { ProfilePicker } from "@/ui/components/track/ProfilePicker";
import { TrackCanvas } from "@/ui/components/track/TrackCanvas";
import { TrackInspector } from "@/ui/components/track/TrackInspector";
import { TrackList } from "@/ui/components/track/TrackList";
import { TrackToolbar } from "@/ui/components/track/TrackToolbar";

function TrackTracerView() {
  const editor = useTrackEditor();
  const tracks = useTracks();
  const exporter = useTrackExport(editor.track, editor.rules);
  const [message, setMessage] = useState("");

  const open = async (id: number) => {
    const track = await tracks.open(id);
    if (track) {
      editor.openTrack(track);
      setMessage("");
    }
  };
  const exportAs = async (kind: ExportKind) => setMessage(await exporter.run(kind));

  return (
    <section className="view on dv" aria-label="Trazador de pistas">
      <Card className="s8">
        <div className="hd">
          <h2>
            Plano <small>{editor.track ? editor.track.name : "sin pista abierta"}</small>
          </h2>
          {editor.track && <span className="tag warn">Sin guardar</span>}
        </div>
        <ProfilePicker
          profiles={editor.profiles.profiles}
          profileId={editor.profileId}
          rules={editor.rules}
          loading={editor.profiles.loading}
          error={editor.profiles.error}
          onSelect={editor.selectProfile}
          onRetry={editor.profiles.reload}
        />
        <TrackToolbar />
        <TrackCanvas />
        {editor.track && (
          <p className="note">
            Los cambios todavía no se guardan en la API: si abres otra pista, empiezas una nueva o
            recargas la página, se pierden.
          </p>
        )}
        <ExportMenu disabled={!editor.track} message={message} onExport={exportAs} />
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
            currentId={editor.track?.id ?? null}
            examples={EXAMPLES}
            onReload={tracks.reload}
            onOpen={open}
            onOpenExample={(t) => {
              editor.openTrack(t);
              setMessage("");
            }}
            onRemove={async (id) => {
              if ((await tracks.remove(id)) && editor.track?.id === id) editor.closeTrack();
            }}
          />
        </Card>
      </div>
    </section>
  );
}

export function TrackTracer() {
  return (
    <TrackEditorProvider>
      <TrackTracerView />
    </TrackEditorProvider>
  );
}
