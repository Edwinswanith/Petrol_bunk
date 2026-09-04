export function PageSkeleton({ cards = 4, panels = 1 }: { cards?: number; panels?: number }) {
  return (
    <div aria-hidden="true" className="page-skeleton" role="presentation">
      <div className="skeleton-header">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-subtitle" />
      </div>
      {cards > 0 ? (
        <div className="skeleton-scoreboard">
          {Array.from({ length: cards }).map((_, index) => <div className="skeleton skeleton-card" key={index} />)}
        </div>
      ) : null}
      {Array.from({ length: panels }).map((_, index) => <div className="skeleton skeleton-panel" key={index} />)}
    </div>
  );
}
