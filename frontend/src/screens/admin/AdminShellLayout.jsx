import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import { ADMIN_DOMAIN_META, ADMIN_NAV_GROUPS, ADMIN_SHELL_THEME } from './adminShellConfig';

function isActiveDomain(pathname, itemPath) {
  if (itemPath === '/admin') return pathname === '/admin' || pathname === '/admin/dashboard';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function getCurrentMeta(pathname) {
  const match = Object.entries(ADMIN_DOMAIN_META).find(([key]) => {
    const fullPath = key === 'dashboard' ? '/admin' : `/admin/${key}`;
    return isActiveDomain(pathname, fullPath);
  });
  if (match) return match[1];
  if (pathname.startsWith('/admin/legacy/')) {
    return {
      title: 'Herramientas legado',
      subtitle: 'Superficies transitorias mientras se materializan los modulos oficiales',
    };
  }
  return {
    title: 'Admin MAQGO',
    subtitle: 'Sistema operativo del marketplace',
  };
}

export default function AdminShellLayout() {
  const location = useLocation();
  const theme = ADMIN_SHELL_THEME;
  const meta = getCurrentMeta(location.pathname);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: theme.appBg,
        color: '#fff',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1480,
          margin: '0 auto',
          padding: 18,
          display: 'grid',
          gridTemplateColumns: '280px minmax(0, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <aside
          style={{
            position: 'sticky',
            top: 18,
            alignSelf: 'start',
            border: `1px solid ${theme.border}`,
            background: theme.panelBg,
            borderRadius: 18,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 16,
              borderBottom: `1px solid ${theme.border}`,
              background: theme.panelBgSoft,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <MaqgoLogo size="small" style={{ margin: 0 }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>Admin MAQGO</div>
              <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.45, color: theme.textMuted }}>
                Arquitectura oficial por dominios para cerrar el MVP sin volver a mezclar responsabilidades.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 16 }}>
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: 'rgba(255,255,255,0.46)',
                  }}
                >
                  {group.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.items.map((item) => {
                    const active = isActiveDomain(location.pathname, item.path);
                    return (
                      <NavLink
                        key={item.key}
                        to={item.path}
                        style={{
                          textDecoration: 'none',
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: `1px solid ${active ? 'rgba(236,104,25,0.40)' : theme.border}`,
                          background: active ? 'rgba(236,104,25,0.14)' : 'transparent',
                          color: active ? '#fff' : 'rgba(255,255,255,0.78)',
                          fontSize: 13,
                          fontWeight: 800,
                        }}
                      >
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section
            style={{
              border: `1px solid ${theme.border}`,
              background: theme.panelBg,
              borderRadius: 18,
              padding: 18,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: theme.brand, textTransform: 'uppercase', letterSpacing: 0.45 }}>
                Shell oficial
              </div>
              <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em' }}>{meta.title}</h1>
              <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: theme.textMuted, maxWidth: 760 }}>
                {meta.subtitle}
              </p>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 999,
                border: `1px solid ${theme.border}`,
                background: 'rgba(255,255,255,0.04)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.74)',
                fontWeight: 800,
              }}
            >
              Dominio oficial
            </div>
          </section>

          <div style={{ minWidth: 0 }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
