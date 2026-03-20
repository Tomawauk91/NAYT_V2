from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class VulnerabilityBase(BaseModel):
    title: str
    severity: str
    description: str

class VulnerabilityCreate(VulnerabilityBase):
    pass

class Vulnerability(VulnerabilityBase):
    id: int
    mission_id: int
    
    class Config:
        from_attributes = True

class MissionBase(BaseModel):
    name: str
    target: str
    status: str = "Pending"
    progress: int = 0

class MissionCreate(MissionBase):
    pass

class Mission(MissionBase):
    id: int
    created_at: datetime
    vulnerabilities: List[Vulnerability] = []
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    
    class Config:
        from_attributes = True

class ScanRequest(BaseModel):
    tool: str
    target: str
    options: Optional[str] = ""

class AutoScanRequest(BaseModel):
    target: str
    tools: List[str]
