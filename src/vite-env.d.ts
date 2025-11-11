/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Type declarations for @techstark/opencv-js
declare module '@techstark/opencv-js' {
  const cvReadyPromise: Promise<any>;
  export default cvReadyPromise;
}

