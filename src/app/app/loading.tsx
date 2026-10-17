/** Route-level skeleton while a page's data loads. Mirrors the Today layout so nothing jumps. */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="fade">
      <div className="skeleton mb-2.5 h-3.5 w-[120px] rounded-[7px]" />
      <div className="skeleton mb-7 h-[34px] w-[300px] rounded-[9px]" />
      <div className="grid gap-7 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          <div className="skeleton h-[120px] rounded-[14px]" />
          <div className="skeleton h-24 rounded-[14px]" />
          <div className="skeleton h-24 rounded-[14px]" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="skeleton h-[200px] rounded-[14px]" />
          <div className="skeleton h-[140px] rounded-[14px]" />
        </div>
      </div>
    </div>
  );
}
