import { AppFrame } from '@zamanushka/ui';

export function App() {
  return (
    <AppFrame title="Заманушка">
      <section className="foundation" aria-labelledby="foundation-title">
        <p className="foundation__eyebrow">EPIC-00</p>
        <h1 id="foundation-title">Фундамент продукта</h1>
        <p className="foundation__lead">
          Техническая основа Telegram Mini App и веб-версии готовится к следующим эпикам.
        </p>
        <div className="foundation__status" role="status">
          <span className="foundation__status-dot" aria-hidden="true" />
          Локальная среда разработки
        </div>
      </section>
    </AppFrame>
  );
}
