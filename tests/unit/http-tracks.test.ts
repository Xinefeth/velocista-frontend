import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_EVENT, accessToken, setAccessToken } from "@/infrastructure/config";
import { ErrorApi } from "@/infrastructure/http/api";
import { profilesApi, parseTrackRules, toTrackProfile } from "@/infrastructure/http/profiles";
import { toTrack, toTrackBody, tracksApi } from "@/infrastructure/http/tracks";
import type { ProfileApi, TrackApi } from "@/infrastructure/contracts/tracks";
import { EXAMPLE_TECHNIQUE } from "@/domain/track/examples";
import { lengthCmOf } from "@/domain/track/limits";
import { LGR_2026 } from "./track/fixtures";

const wire: TrackApi = {
  id: 7,
  name: "Técnica 3 × 2,5",
  board: { width_cm: 300, height_cm: 250 },
  closed: true,
  points: [
    { x: 50, y: 45, radius: 25, gap: false },
    { x: 250, y: 45, radius: 45, gap: true },
    { x: 250, y: 205, radius: 25, gap: false },
  ],
  zones: [{ x: 104, y: 0, width: 12, height: 12, name: "poste" }],
  start: { edge: 1, t: 0.35 },
  profile_id: "lgr2026",
  length_cm: 612.34,
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T11:00:00Z",
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;
const call = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit & { headers: Headers }];
  return { url, init, headers: init.headers };
};

beforeEach(() => {
  setAccessToken(null);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("traducción contrato ↔ dominio", () => {
  it("toTrack pasa de snake_case al modelo de dominio", () => {
    expect(toTrack(wire)).toEqual({
      id: 7,
      name: "Técnica 3 × 2,5",
      board: { widthCm: 300, heightCm: 250 },
      closed: true,
      points: wire.points,
      zones: wire.zones,
      start: { edge: 1, t: 0.35 },
      profileId: "lgr2026",
      lengthCm: 612.34,
      createdAt: "2026-10-28T10:00:00Z",
      updatedAt: "2026-10-28T11:00:00Z",
    });
  });

  it("toTrackBody envía length_cm calculado y ningún campo de solo lectura", () => {
    const body = toTrackBody({ ...EXAMPLE_TECHNIQUE, name: "  Mi pista  " });
    expect(body.name).toBe("Mi pista");
    expect(body.length_cm).toBe(lengthCmOf(EXAMPLE_TECHNIQUE));
    expect(body.length_cm).toBe(833.45);
    expect(body.board).toEqual({ width_cm: 300, height_cm: 250 });
    expect(body.profile_id).toBe("lgr2026");
    expect(Object.keys(body).sort()).toEqual(
      ["board", "closed", "length_cm", "name", "points", "profile_id", "start", "zones"].sort(),
    );
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("created_at");
  });

  it("ida y vuelta conserva la geometría", () => {
    const track = toTrack({ ...wire, ...{ length_cm: lengthCmOf(toTrack(wire)) } });
    const body = toTrackBody(track);
    expect(body.points).toEqual(wire.points);
    expect(body.zones).toEqual(wire.zones);
    expect(body.start).toEqual(wire.start);
  });
});

describe("cliente de pistas", () => {
  it("lista todas las páginas hasta total y añade el JWT", async () => {
    setAccessToken("qa-token");
    const page = (items: TrackApi[], offset: number) => json({ items, total: 3, limit: 200, offset });
    fetchMock
      .mockResolvedValueOnce(page([wire, { ...wire, id: 8 }], 0))
      .mockResolvedValueOnce(page([{ ...wire, id: 9 }], 2));
    const list = await tracksApi.list();
    expect(list.map((t) => t.id)).toEqual([7, 8, 9]);
    expect(call(0).url).toBe("/api/tracks?limit=200&offset=0");
    expect(call(1).url).toBe("/api/tracks?limit=200&offset=2");
    expect(call(0).headers.get("Authorization")).toBe("Bearer qa-token");
  });

  it("una página vacía corta el bucle", async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [], total: 5, limit: 200, offset: 0 }));
    expect(await tracksApi.list()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("get, create y update usan las rutas del contrato", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(wire)));
    expect((await tracksApi.get(7)).id).toBe(7);
    expect(call(0).url).toBe("/api/tracks/7");

    await tracksApi.create({ ...EXAMPLE_TECHNIQUE, id: null });
    expect(call(1).url).toBe("/api/tracks");
    expect(call(1).init.method).toBe("POST");
    expect(JSON.parse(call(1).init.body as string)).not.toHaveProperty("id");

    await tracksApi.update({ ...EXAMPLE_TECHNIQUE, id: 7 });
    expect(call(2).url).toBe("/api/tracks/7");
    expect(call(2).init.method).toBe("PUT");
  });

  it("no actualiza una pista sin guardar", async () => {
    await expect(tracksApi.update({ ...EXAMPLE_TECHNIQUE, id: null })).rejects.toThrow("aún no está guardada");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("borra con DELETE y acepta 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(tracksApi.remove(7)).resolves.toBeUndefined();
    expect(call(0).url).toBe("/api/tracks/7");
    expect(call(0).init.method).toBe("DELETE");
  });

  it("exporta el texto tal cual y el nombre de Content-Disposition", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"id":7}', {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="tecnica-3x25.json"' },
      }),
    );
    expect(await tracksApi.exportJson(7)).toEqual({ text: '{"id":7}', filename: "tecnica-3x25.json" });
    expect(call(0).url).toBe("/api/tracks/7/export");
  });

  it("la exportación sin Content-Disposition no trae nombre", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect((await tracksApi.exportJson(7)).filename).toBeNull();
  });

  it("un error de exportación se traduce a ErrorApi", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: { reason: "track_not_found", detail: "x" } }, 404));
    await expect(tracksApi.exportJson(9)).rejects.toMatchObject({ status: 404, reason: "track_not_found" });
  });
});

describe("errores y sesión", () => {
  it("un 401 limpia el token y pide iniciar sesión", async () => {
    setAccessToken("vencido");
    const onAuth = vi.fn();
    window.addEventListener(AUTH_EVENT, onAuth);
    try {
      fetchMock.mockResolvedValueOnce(json({ detail: "Unauthorized" }, 401));
      await expect(tracksApi.list()).rejects.toMatchObject({ status: 401 });
      expect(accessToken()).toBeNull();
      expect(onAuth).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(AUTH_EVENT, onAuth);
    }
  });

  it("un 422 de forma A llega con los campos por ruta (POST)", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        { detail: [{ type: "less_than_equal", loc: ["body", "points", 3, "radius"], msg: "x", input: 250, ctx: { le: 200 } }] },
        422,
      ),
    );
    const err = (await tracksApi.create(EXAMPLE_TECHNIQUE).catch((e) => e)) as ErrorApi;
    expect(err.fields).toEqual([{ path: "points[3].radius", message: "Debe ser como máximo 200" }]);
  });

  it("un profile_id inexistente da 422 track_profile_unknown tanto en POST como en PUT", async () => {
    const body = { detail: { reason: "track_profile_unknown", detail: "Profile does not exist" } };
    fetchMock.mockImplementation(() => Promise.resolve(json(body, 422)));
    const post = (await tracksApi.create({ ...EXAMPLE_TECHNIQUE, profileId: "nada" }).catch((e) => e)) as ErrorApi;
    const put = (await tracksApi.update({ ...EXAMPLE_TECHNIQUE, id: 7, profileId: "nada" }).catch((e) => e)) as ErrorApi;
    for (const err of [post, put]) {
      expect(err.status).toBe(422);
      expect(err.reason).toBe("track_profile_unknown");
      expect(err.fields?.[0].path).toBe("profile_id");
    }
  });

  it("404 track_not_found", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: { reason: "track_not_found", detail: "x" } }, 404));
    await expect(tracksApi.get(99)).rejects.toMatchObject({ status: 404, message: "La pista ya no existe" });
  });
});

describe("perfiles de la API", () => {
  const trackBlock = {
    line_width_mm: 19,
    gap_length_cm: 2,
    ...Object.fromEntries(Object.entries(LGR_2026.rules)),
  };
  const lgr: ProfileApi = {
    id: "lgr2026",
    competition: "Let's Go Robot 2026",
    label: "LGR 2026",
    category: "Velocista",
    rules: { track: trackBlock as never },
  };
  const club: ProfileApi = { id: "club", competition: "Club", label: "Club", category: "Robot", rules: { dim: [1, 2] } };

  it("lee las reglas de pista en cm y solo los perfiles que las traen", async () => {
    fetchMock.mockResolvedValueOnce(json([lgr, club]));
    const list = await profilesApi.list();
    expect(call(0).url).toBe("/api/profiles");
    expect(list.map((p) => [p.id, p.name, p.rules !== null])).toEqual([
      ["lgr2026", "LGR 2026", true],
      ["club", "Club", false],
    ]);
    expect(list[0].rules).toEqual(LGR_2026);
    expect(list[0].rules?.rules.length_min.value).toBe(500);
  });

  it("un bloque incompleto cuenta como sin reglas de pista", () => {
    expect(parseTrackRules(undefined)).toBeNull();
    expect(parseTrackRules({ line_width_mm: 19 })).toBeNull();
    const { margin: _margin, ...missing } = trackBlock as Record<string, unknown>;
    void _margin;
    expect(parseTrackRules(missing)).toBeNull();
    expect(parseTrackRules({ ...trackBlock, margin: { enabled: "sí", value: 3 } })).toBeNull();
    expect(parseTrackRules({ ...trackBlock, margin: { enabled: true, value: "3" } })).toBeNull();
  });

  it("usa el id como nombre si no hay label", () => {
    expect(toTrackProfile({ ...club, label: "" }).name).toBe("club");
  });
});
