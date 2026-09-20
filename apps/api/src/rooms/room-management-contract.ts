export interface RoomManagementActor {
  userId: string;
}

export interface CreateRoomInput {
  actor: RoomManagementActor;
  title?: string;
}

export interface DeleteRoomInput {
  actor: RoomManagementActor;
  roomId: string;
  expectedRoomVersion?: number;
}

export interface RemoveBotInput {
  actor: RoomManagementActor;
  roomId: string;
  participantId: string;
  expectedRoomVersion?: number;
}

/**
 * Adapt this interface to the current room-service.
 * Rules belong in the existing authoritative room service/transaction.
 */
export interface RoomManagementService {
  createRoom(input: CreateRoomInput): Promise<unknown>;
  deleteRoom(input: DeleteRoomInput): Promise<void>;
  removeBot(input: RemoveBotInput): Promise<void>;
}

/**
 * Required server rules:
 *
 * DELETE ROOM:
 * - host/owner only;
 * - do not delete an ACTIVE match underneath players;
 * - prefer CLOSED/DELETED lifecycle if repository already uses soft-delete;
 * - broadcast canonical room removal/update.
 *
 * REMOVE BOT:
 * - host only;
 * - target participantKind must equal BOT;
 * - never remove HUMAN via this action;
 * - reject after room state no longer allows seating changes;
 * - use room version/conflict protection if already present.
 */
