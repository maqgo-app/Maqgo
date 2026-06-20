import React from 'react';
import ServiceTopBar from './ServiceTopBar';
import ServiceStateHeader from './ServiceStateHeader';
import ServicePrimaryActionCard from './ServicePrimaryActionCard';
import ServiceSummaryCard from './ServiceSummaryCard';
import ServiceSecondaryActions from './ServiceSecondaryActions';

function ServiceStateLayout({
  topBar,
  header,
  primaryTitle,
  primary,
  summary,
  secondaryActions,
  children,
}) {
  const hasRightColumn = !!summary;

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 24px' }}>
        <div className="w-full mx-auto" style={{ maxWidth: 1040 }}>
          <ServiceTopBar {...topBar} />
          <div style={{ height: 10 }} />
          <ServiceStateHeader {...header} />
          <div style={{ height: 16 }} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" style={{ alignItems: 'start' }}>
            <div className={hasRightColumn ? 'lg:col-span-7' : 'lg:col-span-12'} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {primary ? <ServicePrimaryActionCard title={primaryTitle}>{primary}</ServicePrimaryActionCard> : null}
              {children}
            </div>

            {hasRightColumn ? (
              <div className="lg:col-span-5" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {summary ? <ServiceSummaryCard {...summary} /> : null}
              </div>
            ) : null}
          </div>

          <div style={{ height: 16 }} />
          <ServiceSecondaryActions actions={secondaryActions || []} />
        </div>
      </div>
    </div>
  );
}

export default ServiceStateLayout;
