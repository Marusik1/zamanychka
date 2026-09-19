import { useMemo, useState } from 'react';
import './mobile-rooms.css';

export type MobileRoomStatus = 'WAITING' | 'ACTIVE';
export type MobileRoomListItem = {
  roomId: string;
  code: string;
  status: MobileRoomStatus;
  memberCount: number;
  seatedCount: number;
  readyCount: number;
  capacity?: number;
};

type RoomFilter = 'ALL' | 'WAITING' | 'ACTIVE';
type MobileRoomsProps = {
  rooms: readonly MobileRoomListItem[];
  loading?: boolean;
  refreshing?: boolean;
  onCreateRoom: () => void;
  onRefresh: () => void;
  onOpenRoom: (roomId: string) => void;
};

function roomStatusLabel(status: MobileRoomStatus) {
  return status === 'ACTIVE' ? 'Идёт матч' : 'Ожидает игроков';
}

function ChevronRight() {
  return <svg aria-hidden="true" className="z-rooms__chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg>;
}

function RefreshIcon() {
  return <svg aria-hidden="true" className="z-rooms__refresh-icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></svg>;
}

export function MobileRooms({ rooms, loading = false, refreshing = false, onCreateRoom, onRefresh, onOpenRoom }: MobileRoomsProps) {
  const [filter, setFilter] = useState<RoomFilter>('ALL');
  const visibleRooms = useMemo(
    () => filter === 'ALL' ? rooms : rooms.filter((room) => room.status === filter),
    [filter, rooms],
  );

  return <section className="z-rooms" data-testid="mobile-rooms">
    <header className="z-rooms__header">
      <div><h1 className="z-rooms__title">Комнаты</h1><p className="z-rooms__subtitle">Выберите комнату или создайте новую.</p></div>
    </header>
    <div className="z-rooms__actions">
      <button type="button" className="z-rooms__create" onClick={onCreateRoom}><span aria-hidden="true" className="z-rooms__plus">+</span><span>Создать комнату</span></button>
      <button type="button" className="z-rooms__refresh" onClick={onRefresh} disabled={refreshing} aria-label="Обновить список комнат"><RefreshIcon /></button>
    </div>
    <div className="z-rooms__filters" role="group" aria-label="Фильтр комнат">
      {([['ALL', 'Все'], ['WAITING', 'Ожидают'], ['ACTIVE', 'Играют']] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    <section className="z-rooms__available">
      <div className="z-rooms__section-heading"><h2>Доступные комнаты</h2>{!loading ? <span>{visibleRooms.length}</span> : null}</div>
      {loading ? <p className="z-rooms__state">Загружаем комнаты…</p> : visibleRooms.length === 0 ? <div className="z-rooms__empty"><strong>Комнат пока нет</strong><span>Создайте новую комнату и пригласите игроков.</span></div> : <div className="z-rooms__list">
        {visibleRooms.map((room) => {
          const capacity = room.capacity ?? 4;
          return <button key={room.roomId} type="button" className="z-rooms__room" onClick={() => onOpenRoom(room.roomId)}>
            <span className={`z-rooms__status-dot z-rooms__status-dot--${room.status.toLowerCase()}`} aria-hidden="true" />
            <span className="z-rooms__room-copy">
              <strong className="z-rooms__room-title">Комната {room.code}</strong>
              <span className={`z-rooms__room-status z-rooms__room-status--${room.status.toLowerCase()}`}>{roomStatusLabel(room.status)}</span>
              <span className="z-rooms__room-meta">{room.memberCount} участ.<span aria-hidden="true"> · </span>{room.seatedCount}/{capacity} места<span aria-hidden="true"> · </span>{room.readyCount} готовы</span>
            </span>
            <ChevronRight />
          </button>;
        })}
      </div>}
    </section>
  </section>;
}
