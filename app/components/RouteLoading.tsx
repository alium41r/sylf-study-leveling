/**
 * Minimal route-transition skeleton used by loading.tsx boundaries.
 * Keeps navigation instant: Next.js shows this immediately while the
 * route renders/streams, instead of leaving the previous page frozen.
 */
export default function RouteLoading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p
          className="text-sm uppercase tracking-widest text-text-muted animate-pulse"
          style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}
