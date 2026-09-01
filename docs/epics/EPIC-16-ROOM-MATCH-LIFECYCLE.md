# EPIC-16 — Room and Match Lifecycle Hardening

## Goal

Exercise and harden the existing multi-room lifecycle after all gameplay/UI changes.

## Invariants

- one user has at most one active `RoomMembership`;
- `WAITING`, `ACTIVE`, and `FINISHED` room/match lifecycle remains authoritative;
- FINISHED result is scoped to its room and match;
- disconnect is not surrender;
- room chat is room-scoped and survives match reset.

## Required scenarios

Room A→B stale response protection; create/join/seat/unseat/ready/unready/start; finish→return→leave; active reconnect; membership conflict while another room is active; independent rooms; room chat isolation; rematch; old polling/sync/subscription/winner state cleanup.

Checkpoint: `beta: harden room and match lifecycle`.
