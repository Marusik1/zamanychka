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
      stateVersion: number;
      snapshot?: GameSnapshot;
    };
```

ACK confirms that the sender's command was committed. It is not durable event delivery.

## Broadcast

```ts
{
  matchId: string;
  fromSequence: number;
  toSequence: number;
  stateVersion: number;
  events: GameEvent[];
}
```

Broadcast happens only after commit. Events are applied strictly by sequence. Duplicates at or below `lastAppliedSequence` are ignored; a gap triggers synchronization.

## Reconnect

Client sends `game:sync({ matchId, stateVersion, lastSequence })`.

- Return `{ mode: "events", events }` only when a complete continuous range is available and trusted.
- Return `{ mode: "snapshot", snapshot }` on any gap, expiry, large divergence, or doubt.
- Snapshot cancels stale client animation and becomes immediate visual truth.

## Errors

Canonical command error codes include `UNAUTHORIZED`, `MATCH_NOT_FOUND`, `MATCH_ACCESS_DENIED`, `MATCH_FINISHED`, `NOT_YOUR_TURN`, `STALE_STATE_VERSION`, `INVALID_ACTION`, and `PAWN_NOT_MOVABLE`. A stale-version response includes or triggers authoritative synchronization.
