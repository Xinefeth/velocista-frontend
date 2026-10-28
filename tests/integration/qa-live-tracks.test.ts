// Prueba opt-in contra una API real de EN-28 (RUN_LIVE_QA=1). Crea, lista, lee, actualiza, exporta y
// borra UNA pista de prueba y limpia al terminar. Por defecto se salta, así `npm test` sigue en verde sin red.
// Uso (API local sin login):  RUN_LIVE_QA=1 QA_API_URL=http://127.0.0.1:8000 npx vitest run tests/integration/qa-live-tracks.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { lengthCmOf } from "@/domain/track/limits";
import { analyze } from "@/domain/track/rules";
import type { Track } from "@/domain/track/types";
import { ErrorApi } from "@/infrastructure/http/api";
import { profilesApi } from "@/infrastructure/http/profiles";
import { tracksApi } from "@/infrastructure/http/tracks";
import { LGR_2026 } from "../unit/track/fixtures";

const enabled = process.env.RUN_LIVE_QA === "1";
const base = process.env.QA_API_URL || "http://127.0.0.1:8000";
const nativeFetch = globalThis.fetch.bind(globalThis);
const created: number[] = [];
const stamp = `QA EN-28 ${Date.now()}`;
const sample = (patch: Partial<Track> = {}): Track => ({
  ...EXAMPLE_TECHNIQUE,
  name: stamp,
  id: null,
  ...patch,
});
const failure = async (p: Promise<unknown>): Promise<ErrorApi> => {
  try {
    await p;
  } catch (e) {
    return e as ErrorApi;
  }
  throw new Error("se esperaba un error de la API");
};

describe.skipIf(!enabled)("API de pistas real", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) =>
      nativeFetch(new URL(String(input), base), init),
    );
  });
  afterEach(async () => {
    // Limpieza: se borra lo que haya quedado creado, aunque la prueba falle.
    while (created.length) {
      const id = created.pop()!;
      await tracksApi.remove(id).catch(() => undefined);
    }
  });
  afterAll(() => vi.unstubAllGlobals());

  it("los perfiles lgr2026 y libre traen reglas de pista en cm; el resto no", async () => {
    const profiles = await profilesApi.list();
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    expect(byId.lgr2026?.rules).toEqual(LGR_2026);
    expect(byId.libre?.rules?.rules.cross_max).toEqual({ enabled: false, value: 2 });
    for (const id of ["club", "mr4a", "mr4s", "mr4m"])
      if (byId[id]) expect(byId[id].rules).toBeNull();
  });

  it("crea, lista, lee, actualiza, exporta y borra una pista", async () => {
    const made = await tracksApi.create(sample());
    created.push(made.id!);
    expect(Number.isInteger(made.id)).toBe(true);
    expect(made.lengthCm).toBe(lengthCmOf(EXAMPLE_TECHNIQUE));
    expect(made.points).toEqual(EXAMPLE_TECHNIQUE.points);
    expect(made.zones).toEqual(EXAMPLE_TECHNIQUE.zones);
    expect(made.profileId).toBe("lgr2026");
    expect(made.createdAt).toBeTruthy();

    expect((await tracksApi.list()).some((t) => t.id === made.id)).toBe(true);

    const read = await tracksApi.get(made.id!);
    expect(read).toEqual(made);
    // La verificación sobre lo que volvió de la API da lo mismo que en local.
    expect(analyze(read, LGR_2026).issues).toEqual([]);

    const updated = await tracksApi.update({ ...read, name: stamp + " (editada)" });
    expect(updated.name).toBe(stamp + " (editada)");
    expect(updated.id).toBe(made.id);

    const file = await tracksApi.exportJson(made.id!);
    expect(file.filename).toMatch(/\.json$/);
    expect(JSON.parse(file.text)).toMatchObject({
      id: made.id,
      name: stamp + " (editada)",
      length_cm: made.lengthCm,
    });

    await tracksApi.remove(made.id!);
    created.pop();
    const gone = await failure(tracksApi.get(made.id!));
    expect(gone.status).toBe(404);
    expect(gone.reason).toBe("track_not_found");
  });

  it("422 de forma A: la lista de Pydantic llega con la ruta de cada campo", async () => {
    const bad = sample({
      points: sample().points.map((p, i) => (i === 0 ? { ...p, radius: 250 } : p)),
    });
    const err = await failure(tracksApi.create(bad));
    expect(err.status).toBe(422);
    expect(err.reason).toBe("validacion");
    expect(err.fields?.map((f) => f.path)).toContain("points[0].radius");
  });

  it("un nombre de 81 caracteres sale como forma A", async () => {
    const err = await failure(tracksApi.create(sample({ name: "x".repeat(81) })));
    expect(err.status).toBe(422);
    expect(err.fields?.map((f) => f.path)).toContain("name");
  });

  it("422 de forma B: circuito cerrado con menos de 3 puntos y perfil inexistente", async () => {
    const two = sample({
      closed: true,
      points: sample().points.slice(0, 2),
      start: { edge: 0, t: 0.5 },
      zones: [],
    });
    const closed = await failure(tracksApi.create(two));
    expect(closed.status).toBe(422);
    expect(closed.reason).toBe("track_closed_needs_three_points");

    const post = await failure(tracksApi.create(sample({ profileId: "no-existe" })));
    expect(post.reason).toBe("track_profile_unknown");
    expect(post.fields?.[0].path).toBe("profile_id");

    const made = await tracksApi.create(sample());
    created.push(made.id!);
    const put = await failure(tracksApi.update({ ...made, profileId: "no-existe" }));
    expect(put.status).toBe(422);
    expect(put.reason).toBe("track_profile_unknown");
  });

  it("start.edge fuera de rango es forma B", async () => {
    const err = await failure(tracksApi.create(sample({ start: { edge: 99, t: 0.5 } })));
    expect(err.status).toBe(422);
    expect(err.reason).toBe("track_start_invalid");
  });
});
