import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BACKEND_URL, { fetchWithAuth } from '../../utils/api';
import { useToast } from '../../components/Toast';
import { BackArrowIcon } from '../../components/BackArrowIcon';
import { formatCartolaLabel } from '../../utils/weekCartola';
import { friendlyFetchError } from '../../utils/fetchErrors';

/** Lunes ISO de la semana que contiene `isoDate` (YYYY-MM-DD), hora local mediodía para evitar DST. */
export function mondayISOFromCalendarDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const [y, m, d] = isoDate.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return '';
  const x = new Date(y, m - 1, d, 12, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  const yy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function newLine() {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    channel: 'meta',
    audience: 'clientes',
    amount_clp: '',
  };
}

const CHANNEL_OPTIONS = [
  { value: 'meta', label: 'Meta (Facebook / Instagram)' },
  { value: 'google_pmax', label: 'Google Performance Max' },
  { value: 'google_search', label: 'Google Search' },
  { value: 'demand_gen', label: 'Demand Gen' },
  { value: 'otro', label: 'Otro canal' },
];

const AUDIENCE_OPTIONS = [
  { value: 'clientes', label: 'Clientes (demanda)' },
  { value: 'proveedores', label: 'Proveedores (oferta / captación)' },
];

function AdminMarketingScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [weekInput, setWeekInput] = useState(() => {
    const n = new Date();
    const iso = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    return mondayISOFromCalendarDate(iso);
  });
  const [lines, setLines] = useState(() => [newLine()]);
  const [loadingSpend, setLoadingSpend] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [weekMeta, setWeekMeta] = useState(null);
  /** Evita aplicar respuestas viejas si el usuario cambia de semana rápido (race). */
  const spendLoadSeqRef = useRef(0);
  const importSeqRef = useRef(0);

  const weekEffective = useMemo(() => mondayISOFromCalendarDate(weekInput), [weekInput]);

  const cartolaLabel = useMemo(
    () => formatCartolaLabel(weekMeta?.week_start_date || weekEffective, weekMeta),
    [weekEffective, weekMeta],
  );

  /** Suma en pantalla (borrador) por audiencia — útil antes de guardar. */
  const draftTotals = useMemo(() => {
    let clientes = 0;
    let proveedores = 0;
    lines.forEach((l) => {
      const amt = parseFloat(String(l.amount_clp).replace(',', '.')) || 0;
      if (l.audience === 'proveedores') proveedores += amt;
      else clientes += amt;
    });
    return { clientes, proveedores, total: clientes + proveedores };
  }, [lines]);

  /** Al cambiar de semana, ocultar KPIs viejos para no confundir. */
  useEffect(() => {
    setReport(null);
  }, [weekEffective]);

  const loadSpend = useCallback(async () => {
    if (!weekEffective) return;
    const seq = ++spendLoadSeqRef.current;
    setLoadingSpend(true);
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/marketing/spend?week_start=${encodeURIComponent(weekEffective)}`,
      );
      const data = await res.json();
      if (seq !== spendLoadSeqRef.current) return;
      if (!res.ok) {
        throw new Error(data.detail || 'Error al cargar inversión');
      }
      setWeekMeta(data.week_effective || null);
      const raw = data.lines || [];
      if (raw.length === 0) {
        setLines([newLine()]);
      } else {
        setLines(
          raw.map((row) => ({
            key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
            channel: row.channel || 'otro',
            audience: row.audience || 'clientes',
            amount_clp: row.amount_clp != null ? String(row.amount_clp) : '',
          })),
        );
      }
    } catch (e) {
      if (seq !== spendLoadSeqRef.current) return;
      console.error(e);
      toast.error(friendlyFetchError(e, 'No se pudo cargar la semana'), 'marketing-spend-load');
    } finally {
      if (seq === spendLoadSeqRef.current) setLoadingSpend(false);
    }
  }, [weekEffective, toast]);

  useEffect(() => {
    loadSpend();
  }, [loadSpend]);

  /** `isoDate` YYYY-MM-DD + días (p. ej. -7 semana anterior). */
  const shiftCalendarDays = (isoDate, deltaDays) => {
    const [y, m, d] = isoDate.split('-').map((x) => parseInt(x, 10));
    const x = new Date(y, m - 1, d, 12, 0, 0);
    x.setDate(x.getDate() + deltaDays);
    const yy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return mondayISOFromCalendarDate(`${yy}-${mm}-${dd}`);
  };

  const onDateChange = (e) => {
    const v = e.target.value;
    setWeekInput(mondayISOFromCalendarDate(v));
  };

  const updateLine = (idx, field, value) => {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (idx) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const fetchMarketingReport = useCallback(async () => {
    const res = await fetchWithAuth(
      `${BACKEND_URL}/api/admin/marketing/report?week_start=${encodeURIComponent(weekEffective)}`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al generar reporte');
    return data;
  }, [weekEffective]);

  const loadReport = async () => {
    setLoadingReport(true);
    setReport(null);
    try {
      setReport(await fetchMarketingReport());
    } catch (e) {
      console.error(e);
      toast.error(friendlyFetchError(e, 'Error al cargar KPIs'), 'marketing-report-load');
    } finally {
      setLoadingReport(false);
    }
  };

  /** Tras guardar, actualiza KPIs sin borrar la tarjeta (un GET extra; solo ruta admin). */
  const refreshReportAfterSave = async () => {
    setLoadingReport(true);
    try {
      setReport(await fetchMarketingReport());
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn(e);
      }
    } finally {
      setLoadingReport(false);
    }
  };

  const saveSpend = async () => {
    const payloadLines = lines
      .map((l) => ({
        channel: l.channel,
        audience: l.audience,
        amount_clp: parseFloat(String(l.amount_clp).replace(',', '.')) || 0,
      }))
      .filter((l) => l.amount_clp > 0);

    if (payloadLines.length === 0) {
      if (!window.confirm('No hay montos > 0. ¿Guardar para borrar todas las líneas de esta semana?')) return;
    }

    setSaving(true);
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/admin/marketing/spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekEffective, lines: payloadLines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al guardar');
      toast.success(`Guardado · semana ${data.week_effective?.week_start_date || weekEffective}`);
      await loadSpend();
      await refreshReportAfterSave();
    } catch (e) {
      console.error(e);
      toast.error(friendlyFetchError(e, 'Error al guardar'), 'marketing-spend-save');
    } finally {
      setSaving(false);
    }
  };

  const importFromPreviousWeek = async () => {
    const seq = ++importSeqRef.current;
    const prevWeek = shiftCalendarDays(weekEffective, -7);
    setLoadingImport(true);
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/admin/marketing/spend?week_start=${encodeURIComponent(prevWeek)}`,
      );
      const data = await res.json();
      if (seq !== importSeqRef.current) return;
      if (!res.ok) throw new Error(data.detail || 'Error al leer semana anterior');
      const raw = data.lines || [];
      if (raw.length === 0) {
        toast.error('La semana anterior no tiene líneas guardadas');
        return;
      }
      setLines(
        raw.map((row) => ({
          key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
          channel: row.channel || 'otro',
          audience: row.audience || 'clientes',
          amount_clp: row.amount_clp != null ? String(row.amount_clp) : '',
        })),
      );
      toast.success('Importado desde semana anterior — revisa montos y guarda');
    } catch (e) {
      if (seq !== importSeqRef.current) return;
      console.error(e);
      toast.error(friendlyFetchError(e, 'No se pudo importar'), 'marketing-import');
    } finally {
      if (seq === importSeqRef.current) setLoadingImport(false);
    }
  };

  const exportCsv = () => {
    const esc = (val) => `"${String(val).replace(/"/g, '""')}"`;
    const wk = weekMeta?.week_start_date || weekEffective;
    const header = ['week_start', 'channel', 'audience', 'amount_clp'];
    const rows = lines
      .map((l) => {
        const amt = parseFloat(String(l.amount_clp).replace(',', '.')) || 0;
        return { ...l, amt };
      })
      .filter((l) => l.amt > 0)
      .map((l) => [wk, l.channel, l.audience, l.amt]);
    if (rows.length === 0) {
      toast.error('No hay líneas con monto > 0 para exportar');
      return;
    }
    const csv = [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maqgo_marketing_${wk}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV descargado');
  };

  const fmtMoney = (n) =>
    n == null || Number.isNaN(n) ? '—' : `${new Intl.NumberFormat('es-CL').format(n)} CLP`;
  const fmtCount = (n) => (n == null || Number.isNaN(n) ? '—' : new Intl.NumberFormat('es-CL').format(n));
  const fmtPlain = (n) => (n == null || Number.isNaN(n) ? '0' : new Intl.NumberFormat('es-CL').format(Math.round(n)));

  const copyDraftSummary = async () => {
    const from = weekMeta?.week_start_date || weekEffective;
    const to = weekMeta?.week_end_date_inclusive || '—';
    const rows = lines
      .map((l) => {
        const amt = parseFloat(String(l.amount_clp).replace(',', '.')) || 0;
        if (amt <= 0) return null;
        return `  - ${l.channel} / ${l.audience}: ${fmtPlain(amt)} CLP`;
      })
      .filter(Boolean)
      .join('\n');
    const text = [
      'MAQGO — Borrador inversión semanal',
      `Semana: ${from} → ${to} (lun–dom)`,
      '',
      rows || '  (sin montos > 0)',
      '',
      `Totales borrador: clientes ${fmtPlain(draftTotals.clientes)} | proveedores ${fmtPlain(draftTotals.proveedores)} | total ${fmtPlain(draftTotals.total)} CLP`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar (permiso del navegador)');
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#1a1a1a', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <div style={{
        background: '#2A2A2A',
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#EC6819', fontFamily: "'Space Grotesk', sans-serif" }}>
              Marketing & CAC
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: '4px 0 0', maxWidth: 620 }}>
              Inversión semanal por canal y audiencia. Elige la semana con la fecha; el sistema usa el <strong>lunes</strong> de esa semana como clave (buena práctica para alinear con reportes de ads).
              {' '}
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                Solo carga este código al entrar aquí (lazy); no hace más lenta la app para clientes/proveedores.
              </span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="maqgo-btn-secondary" onClick={() => navigate('/admin')}>
              Volver al admin
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
        {/* Semana: campo fecha + rango efectivo */}
        <section
          style={{
            background: '#2A2A2A',
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
            border: '1px solid rgba(236,104,25,0.25)',
          }}
          aria-labelledby="marketing-week-heading"
        >
          <h2 id="marketing-week-heading" style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#EC6819' }}>
            Semana a cargar
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
            <div>
              <label htmlFor="week-start-date" style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
                Fecha (cualquier día de la semana)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setWeekInput((w) => shiftCalendarDays(w, -7))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: '#1a1a1a',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                  title="Semana anterior"
                >
                  <BackArrowIcon size={20} style={{ display: 'block', margin: '0 auto' }} />
                </button>
                <input
                  id="week-start-date"
                  type="date"
                  value={weekInput}
                  onChange={onDateChange}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: '#1a1a1a',
                    color: '#fff',
                    fontSize: 15,
                    minWidth: 200,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setWeekInput((w) => shiftCalendarDays(w, 7))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: '#1a1a1a',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                  title="Semana siguiente"
                >
                  →
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', paddingBottom: 8 }}>
              <strong>Semana efectiva:</strong>{' '}
              {weekMeta
                ? `${weekMeta.week_start_date} → ${weekMeta.week_end_date_inclusive} (lun–dom)`
                : `${weekEffective} (lun–dom, normalizado)`}
            </div>
          </div>
          {cartolaLabel ? (
            <p
              style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.9)',
                margin: '10px 0 0',
                padding: '10px 12px',
                background: 'rgba(144, 189, 211, 0.08)',
                borderRadius: 8,
                border: '1px solid rgba(144, 189, 211, 0.25)',
              }}
            >
              <strong style={{ color: '#90BDD3' }}>Vista cartola:</strong> {cartolaLabel}
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, display: 'block', marginTop: 4 }}>
                “Semana N del mes” = N‑ésimo lunes de ese mes (control interno; el dato guardado sigue siendo el lunes ISO).
              </span>
            </p>
          ) : null}
          <p id="week-hint" style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '12px 0 0', lineHeight: 1.45 }}>
            Best practice: una fila por canal + audiencia (ej. Meta + proveedores). Montos en CLP de la semana según facturación o panel del medio.
          </p>
        </section>

        {/* Tabla inversión */}
        <section style={{ background: '#2A2A2A', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#fff' }}>Inversión semanal (CLP)</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={addLine}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 8,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                + Línea
              </button>
              <button
                type="button"
                onClick={() => loadSpend()}
                disabled={loadingSpend}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid rgba(144, 189, 211, 0.4)',
                  borderRadius: 8,
                  color: '#90BDD3',
                  cursor: loadingSpend ? 'wait' : 'pointer',
                  fontSize: 13,
                }}
                title="Recargar desde servidor"
              >
                Recargar
              </button>
              <button
                type="button"
                onClick={importFromPreviousWeek}
                disabled={loadingSpend || loadingImport}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid rgba(126, 184, 212, 0.45)',
                  borderRadius: 8,
                  color: '#7EB8D4',
                  cursor: loadingSpend || loadingImport ? 'wait' : 'pointer',
                  fontSize: 13,
                }}
                title="Copia líneas y montos de la semana pasada (edita y guarda)"
              >
                {loadingImport ? 'Importando…' : 'Importar semana ant.'}
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={loadingSpend}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid rgba(129, 199, 132, 0.45)',
                  borderRadius: 8,
                  color: '#81C784',
                  cursor: loadingSpend ? 'wait' : 'pointer',
                  fontSize: 13,
                }}
                title="Descarga CSV con líneas con monto > 0"
              >
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={copyDraftSummary}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 8,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Copiar borrador
              </button>
              <button
                type="button"
                onClick={saveSpend}
                disabled={saving || loadingSpend}
                style={{
                  padding: '8px 18px',
                  background: '#EC6819',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  cursor: saving || loadingSpend ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {saving ? 'Guardando…' : 'Guardar semana'}
              </button>
            </div>
          </div>

          {!loadingSpend && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                marginBottom: 14,
                padding: '12px 14px',
                background: '#1a1a1a',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 13,
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.95)' }}>
                <strong style={{ color: '#90BDD3' }}>Borrador</strong> clientes:{' '}
                {fmtPlain(draftTotals.clientes)} CLP
              </span>
              <span style={{ color: 'rgba(255,255,255,0.95)' }}>
                proveedores: {fmtPlain(draftTotals.proveedores)} CLP
              </span>
              <span style={{ color: '#EC6819', fontWeight: 600 }}>
                total: {fmtPlain(draftTotals.total)} CLP
              </span>
            </div>
          )}

          {loadingSpend ? (
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Cargando…</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
                    <th style={{ padding: '8px 8px 12px' }}>Canal</th>
                    <th style={{ padding: '8px 8px 12px' }}>Audiencia</th>
                    <th style={{ padding: '8px 8px 12px' }}>Monto CLP</th>
                    <th style={{ padding: '8px 8px 12px', width: 72 }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '10px 8px', verticalAlign: 'middle' }}>
                        <label className="sr-only" htmlFor={`ch-${line.key}`}>Canal</label>
                        <select
                          id={`ch-${line.key}`}
                          value={line.channel}
                          onChange={(e) => updateLine(idx, 'channel', e.target.value)}
                          style={{
                            width: '100%',
                            maxWidth: 280,
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: '#1a1a1a',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            fontSize: 13,
                          }}
                        >
                          {CHANNEL_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '10px 8px', verticalAlign: 'middle' }}>
                        <label className="sr-only" htmlFor={`aud-${line.key}`}>Audiencia</label>
                        <select
                          id={`aud-${line.key}`}
                          value={line.audience}
                          onChange={(e) => updateLine(idx, 'audience', e.target.value)}
                          style={{
                            width: '100%',
                            maxWidth: 260,
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: '#1a1a1a',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            fontSize: 13,
                          }}
                        >
                          {AUDIENCE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '10px 8px', verticalAlign: 'middle' }}>
                        <label className="sr-only" htmlFor={`amt-${line.key}`}>Monto CLP</label>
                        <input
                          id={`amt-${line.key}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="1"
                          placeholder="0"
                          value={line.amount_clp}
                          onChange={(e) => updateLine(idx, 'amount_clp', e.target.value)}
                          style={{
                            width: '100%',
                            maxWidth: 200,
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: '#1a1a1a',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            fontSize: 14,
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', verticalAlign: 'middle' }}>
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length <= 1}
                          style={{
                            padding: '6px 10px',
                            background: 'transparent',
                            border: '1px solid rgba(244,67,54,0.4)',
                            borderRadius: 6,
                            color: '#E57373',
                            cursor: lines.length <= 1 ? 'not-allowed' : 'pointer',
                            fontSize: 12,
                          }}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* KPIs */}
        <section style={{ background: '#2A2A2A', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>KPIs de la misma semana</h2>
            <button
              type="button"
              onClick={loadReport}
              disabled={loadingReport}
              style={{
                padding: '8px 16px',
                background: '#90BDD3',
                border: 'none',
                borderRadius: 8,
                color: '#1a1a1a',
                cursor: loadingReport ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {loadingReport ? 'Calculando…' : 'Ver / refrescar KPIs'}
            </button>
          </div>
          {report && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Inversión clientes</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{fmtMoney(report.inversion_clp?.clientes)}</div>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Inversión proveedores</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{fmtMoney(report.inversion_clp?.proveedores)}</div>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>CAC cliente (registro)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: '#90BDD3' }}>{fmtMoney(report.kpi?.CAC_cliente_registro_clp)}</div>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>CAC / costo adq. proveedor</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: '#CE93D8' }}>{fmtMoney(report.kpi?.CAC_proveedor_registro_clp)}</div>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Nuevos clientes</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{fmtCount(report.volumen?.nuevos_clientes)}</div>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Nuevos proveedores</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{fmtCount(report.volumen?.nuevos_proveedores)}</div>
                </div>
              </div>

              <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 13, color: '#90BDD3', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Funnel semanal clientes
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Registrados</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCount(report.funnel?.clientes?.registrados)}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Con tarjeta</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCount(report.funnel?.clientes?.con_tarjeta_oneclick)}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Con solicitud</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCount(report.funnel?.clientes?.con_solicitud_servicio)}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Pagados semana</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCount(report.funnel?.clientes?.con_servicio_pagado_semana)}</div>
                  </div>
                  <div style={{ background: 'rgba(229,115,115,0.1)', border: '1px solid rgba(229,115,115,0.28)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Abandono sin tarjeta</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#E57373' }}>{fmtCount(report.funnel?.clientes?.abandono_sin_tarjeta)}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 13, color: '#CE93D8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Funnel semanal proveedores
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Registrados</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCount(report.funnel?.proveedores?.registrados)}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Onboarding completo</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCount(report.funnel?.proveedores?.onboarding_completado)}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Disponibles</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCount(report.funnel?.proveedores?.disponibles)}</div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Con primer servicio</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCount(report.funnel?.proveedores?.con_primer_servicio_semana)}</div>
                  </div>
                  <div style={{ background: 'rgba(229,115,115,0.1)', border: '1px solid rgba(229,115,115,0.28)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Abandono pre onboarding</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#E57373' }}>{fmtCount(report.funnel?.proveedores?.abandono_antes_onboarding)}</div>
                  </div>
                </div>
              </div>
            </>
          )}
          {report?.kpi?.nota && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 14, lineHeight: 1.5 }}>{report.kpi.nota}</p>
          )}
          {report?.funnel?.nota && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.45 }}>{report.funnel.nota}</p>
          )}
        </section>
      </div>

      <style>{`
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
      `}</style>
    </div>
  );
}

export default AdminMarketingScreen;
