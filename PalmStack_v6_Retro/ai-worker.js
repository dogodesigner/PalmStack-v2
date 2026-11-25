import { findBestMove, DEFAULT_DEPTH } from "./ai.js";

self.addEventListener("message", (event) => {
  const { requestId, board, depth = DEFAULT_DEPTH } = event.data;

  try {
    const result = findBestMove(board, depth);

    self.postMessage({
      type: "result",
      requestId,
      result,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error
        ? error.message
        : "Could not calculate the computer move.",
    });
  }
});
