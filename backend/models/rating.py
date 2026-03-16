from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

class Rating(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    serviceId: str
    fromUserId: str
    toUserId: str
    stars: int = 5
    comment: Optional[str] = ''
    createdAt: datetime = Field(default_factory=datetime.utcnow)

class RatingCreate(BaseModel):
    serviceId: str
    fromUserId: str
    toUserId: str
    stars: int
    comment: Optional[str] = ''