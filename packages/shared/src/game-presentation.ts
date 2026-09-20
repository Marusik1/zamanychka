export type GameplayPresentationType =
  | "DICE_ROLLED"
  | "PAWN_ENTERED"
  | "PAWN_MOVED"
  | "PAWN_CAPTURED"
  | "TURN_CHANGED";

export interface GameplayPresentationEnvelope<T = unknown> {
  eventId: string;
  actionId?: string | null;
  matchId: string;
  sequence: number;
  stateVersion: number;
  type: GameplayPresentationType | string;
  payload: T;
  /**
   * Server epoch milliseconds when the authoritative event was committed/emitted.
   */
  serverAt?: number;
  /**
   * Optional shared server-relative presentation timestamp.
   * All clients aim to start the visual at this timestamp.
   */
  presentationAt?: number;
}
