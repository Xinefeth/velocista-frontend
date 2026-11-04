// Estado compartido de la página del celular: código de este celular, su calibración vigente y un
// aviso corto (toast). El código se guarda en el navegador para no perder las mediciones.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { newDeviceId } from "@/domain/measurement/phone";
import { calibrationsApi } from "@/infrastructure/http/measurements";
import type { CalibrationApi } from "@/infrastructure/contracts/measurements";

const KEY = "apaec.celular.device";

export function storedDevice(search = window.location.search): string {
  const fromUrl = new URLSearchParams(search).get("dev");
  try {
    if (fromUrl) localStorage.setItem(KEY, fromUrl);
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const id = newDeviceId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return fromUrl || newDeviceId();
  }
}

interface PhoneState {
  device: string;
  setDevice: (id: string) => void;
  cal: CalibrationApi | null;
  refreshCal: () => Promise<void>;
  toast: string;
  notify: (text: string) => void;
}

const Ctx = createContext<PhoneState | null>(null);

export function PhoneProvider({
  children,
  initialDevice,
}: {
  children: ReactNode;
  initialDevice?: string;
}) {
  const [device, setDeviceState] = useState(() => initialDevice ?? storedDevice());
  const [cal, setCal] = useState<CalibrationApi | null>(null);
  const [toast, setToast] = useState("");

  const setDevice = useCallback((id: string) => {
    setDeviceState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  const refreshCal = useCallback(async () => {
    try {
      setCal((await calibrationsApi.state(device)).calibration);
    } catch {
      /* sin conexión todavía */
    }
  }, [device]);

  useEffect(() => {
    void refreshCal();
  }, [refreshCal]);

  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  return (
    <Ctx.Provider value={{ device, setDevice, cal, refreshCal, toast, notify }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePhone(): PhoneState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePhone fuera de PhoneProvider");
  return v;
}

/** Mensaje bajo un botón: normal, error o éxito. */
export function Msg({ text, kind = "" }: { text: string; kind?: "" | "err" | "good" }) {
  return (
    <p className={`hint ${kind}`.trim()} role={kind === "err" ? "alert" : "status"}>
      {text}
    </p>
  );
}

export type MsgState = { text: string; kind: "" | "err" | "good" };
export const NO_MSG: MsgState = { text: "", kind: "" };
