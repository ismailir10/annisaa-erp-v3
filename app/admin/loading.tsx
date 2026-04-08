export default function AdminLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Title skeleton */}
      <div className="h-7 w-48 bg-muted rounded-lg animate-pulse" />

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-card border border-border rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}
