from datetime import datetime
from ..models.service_offer import ServiceOffer
from ..db import db

def expire_old_offers():
    expired = ServiceOffer.query.filter(ServiceOffer.status == 'PENDING', ServiceOffer.expires_at < datetime.utcnow()).all()
    for offer in expired: offer.status = 'EXPIRED'
    db.session.commit()
