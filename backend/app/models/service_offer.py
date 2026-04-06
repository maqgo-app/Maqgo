from datetime import datetime, timedelta
from .db import db

class ServiceOffer(db.Model):
    __tablename__ = 'service_offers'
    id = db.Column(db.Integer, primary_key=True)
    service_id = db.Column(db.Integer, db.ForeignKey('services.id'), nullable=False)
    provider_id = db.Column(db.Integer, db.ForeignKey('providers.id'), nullable=False)
    status = db.Column(db.String(20), default='PENDING')
    score = db.Column(db.Float, default=0.0)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, default=lambda: datetime.utcnow() + timedelta(seconds=60))
    responded_at = db.Column(db.DateTime, nullable=True)
