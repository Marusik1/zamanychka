# Realtime Protocol

## Socket rooms

- `match:{matchId}`
- `lobby:{roomId}`
- `chat:global`
- `chat:room:{roomId}`

## Command ACK

```ts
type GameCommandAck =
  | { ok: true; actionId: string; stateVersion: number; lastSequence: number }
  | {
      ok: false;
      actionId: string;
      code: GameCommandErrorCode;
      stateVersion?: number;
      snapshot?: GameSnapshot;
    };
```

Success ACK confirms that the sender's command was committed. Failure ACK contains version only when the caller is authorized to know an existing match. ACK is not durable event delivery and may arrive before or after the post-commit broadcast.

## Broadcast

```ts
{
  matchId: string;
  fromSequence: number;
  toSequence: number;
  stateVersion: number;
  events: GameEventEnvelope[];
  snapshot: GameSnapshot;
}
```

Broadcast happens only after commit through the durable outbox. Events are applied strictly by sequence. Duplicates at or below `lastAppliedSequence` are ignored; a gap triggers synchronization. The included final snapshot is authoritative after the event animation batch.

## Event and snapshot contract

```ts
type GameEventEnvelope = {
  [K in GameEventType]: {
    matchId: string;
    eventId: string;
    sequence: number;
    stateVersion: number; // resulting transition version
    type: K;
    payload: GameEventPayloadByType[K];
    createdAt: string;
  };
}[GameEventType];

type GameSnapshot = GameState & { lastSequence: number };
```

All events created by one transition share its resulting `stateVersion` and occupy one continuous sequence interval. Sync-by-events returns transition batches grouped by `stateVersion`, each with its final authoritative snapshot. The client animates the ordered events, then reconciles to that batch snapshot; it does not infer state-version increments from individual events.

Canonical event order and minimum payload intent:

1. `diceRolled` — player and server result.
2. `pawnEntered` or `pawnMoved` — pawn, semantic from/to, and physical path.
3. `pawnCaptured` — captured pawn/player and coordinate, only after the move event.
4. `pawnEnteredHome` — pawn and resulting home index when a move crosses into HOME.
5. `playerSurrendered`, followed by stable pawn-ID-ordered `pawnRemoved` events.
6. `extraRollGranted` or `turnChanged` when applicable.
7. `gameWon` last, with winner and canonical reason.

Normative payloads:

```ts
type GameEventPayloadByType = {
  participantJoined: { playerId: string; seatIndex: number; color: PlayerColor };
  participantLeft: { playerId: string; seatIndex: number };
  participantReadyChanged: { playerId: string; ready: boolean };
  matchReady: { playerIds: string[] };
  matchWaiting: { playerIds: string[]; reason: 'PLAYER_LEFT' | 'PLAYER_UNREADY' };
  matchStarted: { startingPlayerId: string; turnNumber: 1 };
  matchAbandoned: { reason: 'LOBBY_CANCELLED' };
  diceRolled: { playerId: string; value: DiceValue };
  pawnEntered: { playerId: string; pawnId: string; to: PawnPosition; toCoord: BoardCoord };
  pawnMoved: {
    playerId: string;
    pawnId: string;
    from: PawnPosition;
    to: PawnPosition;
    fromCoord: BoardCoord;
    toCoord: BoardCoord;
    physicalPath: BoardCoord[];
  };
  pawnCaptured: {
    attackerPawnId: string;
    capturedPawnId: string;
    capturedPlayerId: string;
    atCoord: BoardCoord;
    capturedTo: { zone: 'OFF_BOARD' };
  };
  pawnEnteredHome: { playerId: string; pawnId: string; homeIndex: 0 | 1 | 2 | 3 };
  playerSurrendered: { playerId: string };
  pawnRemoved: {
    playerId: string;
    pawnId: string;
    reason:
      'OFF_BOARD_CAPTURED' | 'HOME_CAPTURED' | 'SURRENDERED' | 'INACTIVE_CORNER_EXIT' | 'RESET';
  };
  extraRollGranted: {
    playerId: string;
    reason: 'ROLLED_SIX' | 'CAPTURE' | 'NO_LEGAL_ACTION_ON_SIX';
  };
  turnChanged: { fromPlayerId: string; toPlayerId: string; turnNumber: number };
  gameWon: { winnerPlayerId: string; reason: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER' };
};
```

Emission rules are normative: join, leave, and readiness changes emit their named participant event and then a status event if status changed; other lifecycle transitions emit their named lifecycle event. All `playerIds` arrays use immutable seat order. Every roll emits `diceRolled`; entry emits `pawnEntered`; movement emits `pawnMoved`, then optional `pawnCaptured`, then `pawnEnteredHome` iff the pawn crossed from perimeter into home. Exact landing on an inactive corner emits `pawnMoved` to its physical corner and then `pawnRemoved(INACTIVE_CORNER_EXIT)`. Surrender emits `playerSurrendered` and one `pawnRemoved` for each pawn in stable pawn-ID order. A normal completed action ends with `extraRollGranted` or `turnChanged`; a non-current surrender may end with neither when current player and phase remain unchanged, whether that phase is `WAITING_FOR_ROLL` or `WAITING_FOR_ACTION`. A winning transition ends with `gameWon` and no later event. Events are committed facts and are validated as shared Zod discriminated unions.

## Reconnect

Client sends `game:sync({ matchId, stateVersion, lastSequence })`.

- Return `{ mode: "events", transitions }` only when a complete continuous range is available and trusted. Each transition includes its events and resulting snapshot.
- Return `{ mode: "snapshot", snapshot }` on any gap, expiry, large divergence, or doubt.
- Snapshot cancels stale client animation and becomes immediate visual truth.
- Active clients periodically compare the server's `(stateVersion, lastSequence)` watermark and sync on mismatch, including when an outbox publish was delayed or missed.

## Errors

Canonical command error codes include `UNAUTHORIZED`, `MATCH_NOT_FOUND`, `MATCH_ACCESS_DENIED`, `MATCH_FINISHED`, `NOT_YOUR_TURN`, `STALE_STATE_VERSION`, `INVALID_ACTION`, `PAWN_NOT_MOVABLE`, and `ACTION_ID_CONFLICT`. A stale-version response includes or triggers authoritative synchronization.
