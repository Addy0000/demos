export type Result = { error?: string; success?: string };

/**
 * Call a server action without letting a thrown error take the whole screen down.
 *
 * Permission and session failures throw by design (assertPermission), and an
 * uncaught throw inside a transition escalates to the route's error boundary —
 * which is the wrong response to "you are not allowed to do that". Next redacts
 * server-side messages in production, so the fallback has to stand on its own.
 */
export async function safeAction<T extends Result>(run: () => Promise<T>): Promise<T | Result> {
  try {
    return await run();
  } catch (e) {
    const message =
      e instanceof Error && e.message && !e.message.startsWith("An error occurred in the Server")
        ? e.message
        : "That action could not be completed. Refresh and try again — if it persists, sign out and back in.";
    return { error: message };
  }
}
