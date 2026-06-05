/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OVERLAYS_URL?: string;
  readonly VITE_GATEWAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
