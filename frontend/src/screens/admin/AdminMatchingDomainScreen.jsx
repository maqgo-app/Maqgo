import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminActionLink, AdminDomainCard, AdminStatChip, AdminSurface } from './AdminShellBlocks.jsx';
import { fetchAdminMatchingHistory } from './adminDomainData';
import { ADMIN_RANGE_PRESETS, buildRecentRange, persistAdminRange, readAdminRange } from './adminTimeContext';

const INPUT_STYLE = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 700,
};

export default function AdminMatchingDomainScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({ items: [], summary: {} });
  const [range, setRange] = useState(() => readAdminRange('operations', searchParams, 30));
  const [statusScope, setStatusScope] = useState(() => String(searchParams.get('scope') || 'all'));

  useEffect(() => {
    persistAdminRange('operations', range);
    const next = new URLSearchParams(searchParams);
    next.set('from', range.fromDate);
    next.set('to', range.toDate);
    if (statusScope && statusScope !== 'all') next.set('scope', statusScope);
    else next.delete('scope');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [range, searchParams, setSearchParams, statusScope]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const json = await fetchAdminMatchingHistory(200, {
          fromDate: range.fromDate,
          toDate: range.toDate,
          statusScope,
        });
        if (active) setPayload({ items: Array.isArray(json?.items) ? json.items : [], summary: json?.summary || {} });
      } catch (err) {
        if (active) setError(err?.message || 'No se pudo cargar matching.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [range.fromDate, range.toDate, statusScope]);

  const stats = useMemo(() => {
    const summary = payload?.summary || {};
    return {
      total: summary.total || 0,
      matching: summary.matching || 0,
      offers: summary.offer_sent || 0,
      active: (summary.confirmed || 0) + (summary.in_progress || 0),
      closed: summary.closed || 0,
      attempts: summary.attempts || 0,
    };
  }, [payload]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface
        title="Matching"
        subtitle="Revisa la asignación de oferta por rango, desde búsqueda hasta cierre del caso."
        right={<AdminActionLink to="/admin/legacy/area/system" label="Ver matching actual" tone="secondary" />}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input
            type="date"
            value={range.fromDate}
            onChange={(e) => setRange((current) => ({ ...current, fromDate: e.target.value }))}
            style={INPUT_STYLE}
          />
          <input
            type="date"
            value={range.toDate}
            onChange={(e) => setRange((current) => ({ ...current, toDate: e.target.value }))}
            style={INPUT_STYLE}
          />
          <select value={statusScope} onChange={(e) => setStatusScope(e.target.value)} style={INPUT_STYLE}>
            <option value="all">Todo el rango</option>
            <option value="active">Solo activos</option>
            <option value="closed">Solo cerrados</option>
          </select>
          {ADMIN_RANGE_PRESETS.map((preset) => (
            <button
              key={`matching-preset-${preset.days}`}
              type="button"
              onClick={() => setRange(buildRecentRange(preset.days))}
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdminStatChip label="Solicitudes" value={String(stats.total)} tone="brand" />
          <AdminStatChip label="Buscando oferta" value={String(stats.matching)} tone="warning" />
          <AdminStatChip label="Ofertas enviadas" value={String(stats.offers)} tone="neutral" />
          <AdminStatChip label="Asignadas" value={String(stats.active)} tone="success" />
          <AdminStatChip label="Cerradas" value={String(stats.closed)} tone="neutral" />
          <AdminStatChip label="Intentos" value={String(stats.attempts)} tone="brand" />
        </div>
      </AdminSurface>

      <AdminSurface
        title="Casos del rango"
        subtitle="Histórico operativo del matching dentro del período seleccionado."
      >
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>Cargando matching…</div>
        ) : error ? (
          <div style={{ color: '#E8A34B', fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {payload.items.slice(0, 24).map((item, index) => (
              <AdminDomainCard
                key={`${item?.id || item?._id || index}`}
                title={item?.locationName || item?.location?.address || 'Solicitud activa'}
                subtitle={`${item?.machineryType || 'Sin maquinaria'} · ${item?.status || 'matching'}`}
                bullets={[
                  `Cliente: ${item?.clientName || item?.clientId || '-'}`,
                  `Intentos: ${Array.isArray(item?.matchingAttempts) ? item.matchingAttempts.length : 0}`,
                  `Creada: ${item?.createdAt ? new Date(item.createdAt).toLocaleString('es-CL') : '-'}`,
                ]}
              />
            ))}
          </div>
        )}
      </AdminSurface>

      <AdminSurface
        title="Lectura del rango"
        subtitle="Interpretación rápida para entender presión de matching y cobertura en el período."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <AdminDomainCard
            title="Cobertura"
            subtitle="Casos que avanzaron o quedaron pendientes"
            bullets={[
              `Buscando oferta: ${stats.matching}`,
              `Ofertas enviadas: ${stats.offers}`,
              `Asignadas: ${stats.active}`,
            ]}
          />
          <AdminDomainCard
            title="Carga operativa"
            subtitle="Volumen e intensidad de matching"
            bullets={[
              `Solicitudes en rango: ${stats.total}`,
              `Intentos acumulados: ${stats.attempts}`,
              `Promedio por caso: ${stats.total ? (stats.attempts / stats.total).toFixed(1) : '0.0'}`,
            ]}
          />
          <AdminDomainCard
            title="Cierre"
            subtitle="Casos fuera de la cola activa"
            bullets={[
              `Cerradas: ${stats.closed}`,
              statusScope === 'active' ? 'El filtro actual deja fuera cierres' : 'Incluye estados fuera de la cola activa',
              'Útil para entender si matching resuelve o acumula fricción',
            ]}
          />
        </div>
      </AdminSurface>
    </div>
  );
}
