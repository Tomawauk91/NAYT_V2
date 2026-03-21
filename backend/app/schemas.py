from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class VulnerabilityBase(BaseModel):
    title: str
    severity: str
    description: str
    evidence: Optional[str] = None
    status: Optional[str] = "Open"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    executed_by: Optional[str] = "Automated Scan"

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
    role: str = "Viewer"

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    
    class Config:
        from_attributes = True

class ScanRequest(BaseModel):
    mission_id: int
    tool: str
    target: str
    options: Optional[str] = ""

class AutoScanRequest(BaseModel):
    mission_id: int
    target: str
    tools: List[str]
    port: Optional[str] = ""

class CustomCommandRequest(BaseModel):
    mission_id: int
    command: str


class VulnerabilityUpdate(BaseModel):
    title: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
