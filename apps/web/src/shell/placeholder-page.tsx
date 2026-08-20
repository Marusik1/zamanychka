import { Panel } from '@zamanushka/ui';

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  scaffoldLabel: string;
};

export function PlaceholderPage({
  description,
  eyebrow,
  scaffoldLabel,
  title,
}: PlaceholderPageProps) {
  return (
    <section className="shell-placeholder-page" aria-labelledby="shell-placeholder-title">
      <header className="shell-placeholder-page__header">
        <p className="shell-placeholder-page__eyebrow">{eyebrow}</p>
        <h1 id="shell-placeholder-title">{title}</h1>
        <p className="shell-placeholder-page__description">{description}</p>
      </header>
      <div className="shell-placeholder-page__scaffold" aria-label={scaffoldLabel}>
        <Panel as="section" className="shell-placeholder-page__panel">
          <div className="shell-placeholder-page__bar" />
          <div className="shell-placeholder-page__bar shell-placeholder-page__bar--short" />
        </Panel>
        <Panel as="section" className="shell-placeholder-page__panel">
          <div className="shell-placeholder-page__grid" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </Panel>
      </div>
    </section>
  );
}
