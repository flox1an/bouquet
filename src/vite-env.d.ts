/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISABLE_EVENT_PUBLISH?: string;
  readonly VITE_RELAYS?: string;
  readonly VITE_IMAGE_PROXY?: string;
}
