from pydantic import BaseModel, Field
from datetime import datetime
import uuid

class Payment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    serviceId: str
    status: str = 'validated'  # validated | charged | failed
    amount: float = 50.0
    provider: str = 'transbank'  # transbank | mercadopago
    token: str = ''
    createdAt: datetime = Field(default_factory=datetime.utcnow)

class PaymentCreate(BaseModel):
    serviceId: str
    amount: float
    cardNumber: str
    expiryMonth: str
    expiryYear: str
    cvv: str