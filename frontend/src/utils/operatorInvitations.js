const WARNING_AFTER_HOURS = 24;

function parseDateSafe(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getOperatorInvitationAgeHours(invitation) {
  const createdAt = parseDateSafe(invitation?.created_at);
  if (!createdAt) return null;
  const diffMs = Date.now() - createdAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60));
}

export function formatOperatorInvitationAge(ageHours) {
  if (!Number.isFinite(ageHours) || ageHours < 1) return 'Hace menos de 1 hora';
  if (ageHours < 24) return `Hace ${ageHours} h`;
  const days = Math.floor(ageHours / 24);
  if (days === 1) return 'Hace 1 dia';
  return `Hace ${days} dias`;
}

export function getOperatorInvitationWarning(invitation, warningAfterHours = WARNING_AFTER_HOURS) {
  const isOperatorInvite = String(invitation?.invite_type || 'operator') !== 'master';
  if (!isOperatorInvite || String(invitation?.status || 'pending') !== 'pending') return null;

  const ageHours = getOperatorInvitationAgeHours(invitation);
  if (!Number.isFinite(ageHours)) return null;

  const overdue = ageHours >= warningAfterHours;
  return {
    ageHours,
    ageLabel: formatOperatorInvitationAge(ageHours),
    overdue,
    warningAfterHours,
    tone: overdue ? 'warning' : 'neutral',
    message: overdue
      ? `Aun no enrola su codigo de activacion (${formatOperatorInvitationAge(ageHours)}).`
      : `Codigo pendiente de uso (${formatOperatorInvitationAge(ageHours)}).`,
  };
}

export function getOverdueOperatorInvitations(invitations, warningAfterHours = WARNING_AFTER_HOURS) {
  return (Array.isArray(invitations) ? invitations : []).filter((inv) => {
    const warning = getOperatorInvitationWarning(inv, warningAfterHours);
    return warning?.overdue === true;
  });
}

