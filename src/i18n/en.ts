/** English UI strings. The app reads copy from here, not from components. */
export const en = {
  reader: {
    title: "Reader",
    bridgeWaiting: "Waiting for the reader page.",
    bridgeOk: "The reader page answered.",
    bridgeFailed: "The reader page did not answer.",
    suiteRunning: "Running",
    suiteDone: "On-device checks finished.",
  },
} as const;

export type Strings = typeof en;
