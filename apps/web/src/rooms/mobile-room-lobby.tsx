import './mobile-rooms.css';
export type MobileLobbySeat = { seatIndex: 0 | 1 | 2 | 3; displayName: string | null; isSelf?: boolean; ready?: boolean };
export type MobileLobbyAction = { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean };
type MobileRoomLobbyProps = { code: string; status: 'WAITING' | 'ACTIVE'; seats: readonly MobileLobbySeat[]; primaryAction?: MobileLobbyAction | null; secondaryActions?: readonly MobileLobbyAction[]; onBack: () => void };
function roomStatus(status: 'WAITING' | 'ACTIVE') { return status === 'ACTIVE' ? 'Идёт матч' : 'Ожидает игроков'; }
export function MobileRoomLobby({ code, status, seats, primaryAction = null, secondaryActions = [], onBack }: MobileRoomLobbyProps) {
  const occupied = seats.filter((seat) => seat.displayName).length;
  return <section className="z-lobby" data-testid="mobile-room-lobby">
    <header className="z-lobby__header"><button type="button" className="z-lobby__back" onClick={onBack} aria-label="Назад к комнатам">←</button><div className="z-lobby__header-copy"><h1>Комната {code}</h1><span>{roomStatus(status)}</span></div></header>
    <div className="z-lobby__summary"><strong>{occupied} из {seats.length} игроков</strong></div>
    <div className="z-lobby__players">{seats.map((seat) => <div className="z-lobby__player" key={seat.seatIndex}><div className="z-lobby__player-copy">{seat.displayName ? <><strong>{seat.displayName}{seat.isSelf ? ' (Вы)' : ''}</strong><span>Место {seat.seatIndex + 1}</span></> : <><strong className="z-lobby__free">Свободное место</strong><span>Место {seat.seatIndex + 1}</span></>}</div>{seat.displayName ? <span className={seat.ready ? 'z-lobby__ready is-ready' : 'z-lobby__ready'}>{seat.ready ? 'Готов' : 'Не готов'}</span> : null}</div>)}</div>
    {primaryAction ? <button type="button" className="z-lobby__primary" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{primaryAction.label}</button> : null}
    {secondaryActions.length > 0 ? <div className="z-lobby__secondary">{secondaryActions.map((action) => <button type="button" key={action.label} className={action.destructive ? 'z-lobby__secondary-action is-destructive' : 'z-lobby__secondary-action'} onClick={action.onClick} disabled={action.disabled}>{action.label}</button>)}</div> : null}
  </section>;
}
