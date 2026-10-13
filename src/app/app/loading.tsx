/** Route-level skeleton while a page's data loads. */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="fade">
      <div className="skeleton h-4 w-32 mb-3" />
      <div className="skeleton h-9 w-72 mb-8" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="skeleton h-72" />
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}
