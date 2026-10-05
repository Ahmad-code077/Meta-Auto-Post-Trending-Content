// Result shape returned by server actions. Errors are returned, not thrown,
// so client components can revert optimistic state and show a message.
export type ActionResult<T = undefined> =
    | { success: true; data?: T }
    | { success: false; message: string }
