/** English UI strings. The app reads copy from here, not from components. */
export const en = {
  reader: {
    title: "Reader",
    bridgeWaiting: "Waiting for the reader page.",
    bridgeOk: "The reader page answered.",
    bridgeFailed: "The reader page did not answer.",
    serverStarting: "Starting the book server.",
    readyWait: "Ready. Waiting to open.",
    noCheck: "No check was requested.",
    opening: "Opening.",
    firstPage: "First page is up.",
    missingBook: "The book file is not in app storage.",
    suiteRunning: "Running",
    suiteDone: "Check finished.",
  },
} as const;

export type Strings = typeof en;
