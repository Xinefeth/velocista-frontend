// Vista Trazador de pistas (EN-28, solo lectura en esta fase): lista, plano, verificación y exportación.
// Usa solo hooks de application/ (sin imports de infraestructura) y las clases de la consola.
import { useMemo, useState } from "react";
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
import { TrackList } from "@/ui/components/track/TrackList";
import type { Scene } from "@/ui/components/track/drawScene";

function TrackTracerView() {
  const editor = useTrackEditor();
  const tracks = useTracks();
  const exporter = useTrackExport(editor.track, editor.rules);
  const [message, setMessage] = useState("");

  const scene = useMemo<Scene | null>(
    () =>
      editor.track
        ? {
            track: editor.track,
            analysis: editor.analysis,
            rules: editor.rules,
            issueSel: editor.issueSel,
          }
        : null,
    [editor.track, editor.analysis, editor.rules, editor.issueSel],
  );

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
          <span className="tag">Solo lectura</span>
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
        <TrackCanvas scene={scene} />
        <ExportMenu disabled={!editor.track} message={message} onExport={exportAs} />
      </Card>
      <div className="s4 stack">
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
