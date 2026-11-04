// Sirve la página del celular (celular.html) también en /celular/ (con barra final), igual que la
// regla de render.yaml. Sin esto, /celular/ cae en el SPA de la consola tanto en `vite` (dev)
// como en `vite preview`.
import type { Plugin } from "vite";

/** Reescribe `/celular` y `/celular/` (con o sin query) a `/celular.html`; el resto queda igual. */
export function celularUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/^\/celular\/?(?=\?|#|$)/, "/celular.html");
}

export function celularRewrite(): Plugin {
  const middleware = (req: { url?: string }, _res: unknown, next: () => void) => {
    req.url = celularUrl(req.url);
    next();
  };
  return {
    name: "celular-rewrite",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
