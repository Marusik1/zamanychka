import './mobile-home.css';

type HomeStats = {
  games: number;
  wins: number;
  winRate: number;
};

type CurrentRoomSummary = {
  roomId: string;
  code: string;
  statusLabel: string;
} | null;

type MobileHomeProps = {
  displayName: string;
  initials: string;
  stats: HomeStats;
  currentRoom?: CurrentRoomSummary;
  onLogout: () => void;
  onOpenRooms: () => void;
  onOpenRules: () => void;
  onOpenCurrentRoom?: (roomId: string) => void;
};

function ChevronRight() {
  return <svg aria-hidden="true" className="z-home__chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg>;
}

function RoomsIcon() {
  return <svg aria-hidden="true" className="z-home__row-icon-svg" viewBox="0 0 24 24"><path d="M4 7.5 12 3l8 4.5V20H4Z" /><path d="M9 20v-6h6v6" /></svg>;
}

function RulesIcon() {
  return <svg aria-hidden="true" className="z-home__row-icon-svg" viewBox="0 0 24 24"><path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3Z" /><path d="M8 8h6M8 11h6M8 14h4" /></svg>;
}

function ContinueIcon() {
  return <svg aria-hidden="true" className="z-home__row-icon-svg" viewBox="0 0 24 24"><path d="M8 5v14l11-7Z" /></svg>;
}

type FunctionRowProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
};

function FunctionRow({ icon, title, description, onClick }: FunctionRowProps) {
  return (
    <button className="z-home__function-row" type="button" onClick={onClick}>
      <span className="z-home__row-icon">{icon}</span>
      <span className="z-home__row-copy">
        <span className="z-home__row-title">{title}</span>
        <span className="z-home__row-description">{description}</span>
      </span>
      <ChevronRight />
    </button>
  );
}

export function MobileHome({
  displayName,
  initials,
  stats,
  currentRoom = null,
  onLogout,
  onOpenRooms,
  onOpenRules,
  onOpenCurrentRoom,
}: MobileHomeProps) {
  return (
    <section className="z-home" data-testid="mobile-home">
      <div className="z-home__session">
        <div className="z-home__avatar" aria-hidden="true">{initials}</div>
        <div className="z-home__session-copy">
          <span className="z-home__eyebrow">АКТИВНАЯ СЕССИЯ</span>
          <strong className="z-home__session-name">{displayName}</strong>
        </div>
        <button className="z-home__logout" type="button" onClick={onLogout}>Выйти</button>
      </div>

      <section className="z-home__welcome">
        <div className="z-home__welcome-copy">
          <h1 className="z-home__welcome-title">{displayName}, добро пожаловать!</h1>
          <p className="z-home__welcome-text">Играйте с друзьями и продолжайте свои партии.</p>
        </div>
        <div className="z-home__stats-block">
          <span className="z-home__stats-label">ВАША СТАТИСТИКА</span>
          <div className="z-home__stats">
            <div className="z-home__stat"><strong>{stats.games}</strong><span>Игры</span></div>
            <div className="z-home__stat"><strong>{stats.winRate}%</strong><span>Винрейт</span></div>
            <div className="z-home__stat"><strong>{stats.wins}</strong><span>Победы</span></div>
          </div>
        </div>
      </section>

      <button className="z-home__primary" type="button" onClick={onOpenRooms}>
        <span className="z-home__primary-copy"><strong>Открыть комнаты</strong><span>Выберите комнату или создайте новую</span></span>
        <span className="z-home__primary-arrow" aria-hidden="true">→</span>
      </button>

      {currentRoom && onOpenCurrentRoom ? (
        <div className="z-home__section">
          <span className="z-home__section-label">ПРОДОЛЖИТЬ</span>
          <FunctionRow icon={<ContinueIcon />} title={`Комната ${currentRoom.code}`} description={currentRoom.statusLabel} onClick={() => onOpenCurrentRoom(currentRoom.roomId)} />
        </div>
      ) : null}

      <nav className="z-home__actions" aria-label="Действия">
        <FunctionRow icon={<RoomsIcon />} title="Комнаты" description="Играйте с друзьями в существующих комнатах" onClick={onOpenRooms} />
        <FunctionRow icon={<RulesIcon />} title="Правила игры" description="Посмотреть правила Заманушки" onClick={onOpenRules} />
      </nav>
    </section>
  );
}
