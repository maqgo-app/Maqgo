/**
 * Skeleton para listas – reemplazo de "Cargando..." genérico
 * Usa estilos inline (sin Tailwind) para consistencia con la app MAQGO
 */
const SKELETON_STYLE = `
  @keyframes skeleton-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
`;

function SkeletonBar({ width = '100%', height = 12, style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background: '#444',
        animation: 'skeleton-pulse 1.2s ease-in-out infinite',
        willChange: 'opacity',
        ...style
      }}
    />
  );
}

/** Skeleton para tarjeta de proveedor (ProviderOptionsScreen) */
export function ProviderCardSkeleton() {
  return (
    <div
      style={{
        background: '#363636',
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}
    >
      <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
        <div style={{
          width: 75,
          height: 55,
          borderRadius: 8,
          background: '#444',
          animation: 'skeleton-pulse 1.2s ease-in-out infinite',
          willChange: 'opacity'
        }} />
        <div style={{ flex: 1 }}>
          <SkeletonBar width="60%" height={22} style={{ marginBottom: 8 }} />
          <SkeletonBar width="40%" height={12} />
        </div>
      </div>
      <SkeletonBar width="100%" height={10} />
      <SkeletonBar width="80%" height={10} />
    </div>
  );
}

/** Skeleton para historial (HistoryScreen, ProviderHistoryScreen) */
export function HistoryItemSkeleton() {
  return (
    <div
      style={{
        background: '#363636',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        display: 'flex',
        gap: 14
      }}
    >
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        background: '#444',
        flexShrink: 0
      }} />
      <div style={{ flex: 1 }}>
        <SkeletonBar width="70%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonBar width="50%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonBar width="40%" height={12} />
      </div>
    </div>
  );
}

/** Lista de skeletons para pantallas de carga */
export function ProviderOptionsSkeleton() {
  return (
    <>
      <style>{SKELETON_STYLE}</style>
      {[1, 2, 3, 4, 5].map((i) => (
        <ProviderCardSkeleton key={i} />
      ))}
    </>
  );
}

export function HistoryListSkeleton({ count = 4 }) {
  return (
    <>
      <style>{SKELETON_STYLE}</style>
      {Array.from({ length: count }).map((_, i) => (
        <HistoryItemSkeleton key={i} />
      ))}
    </>
  );
}
