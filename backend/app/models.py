from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum, JSON, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum

class MissionStatus(str, enum.Enum):
    PENDING = "Pending"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    FAILED = "Failed"

class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    company = Column(String, index=True)
    email = Column(String)
    phone = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    user_id = Column(Integer, ForeignKey("users.id"))
    missions = relationship("Mission", back_populates="client")
    owner = relationship("User")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="Viewer")

class Mission(Base):
    __tablename__ = "missions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    target = Column(String, index=True)
    status = Column(String, default="Pending")
    progress = Column(Integer, default=0)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    client = relationship("Client", back_populates="missions")
    owner = relationship("User")
    vulnerabilities = relationship("Vulnerability", back_populates="mission", cascade="all, delete-orphan")

class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id"))
    title = Column(String)
    severity = Column(String) # Critical, High, Medium, Low, Info
    description = Column(Text)
    evidence = Column(Text)
    cvss = Column(Float, nullable=True)
    status = Column(String, default="Open")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    executed_by = Column(String, default="Automated Scan")
    
    mission = relationship("Mission", back_populates="vulnerabilities")

class ActionLog(Base):
    __tablename__ = "action_logs"
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String)
    details = Column(Text)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class SystemConfig(Base):
    __tablename__ = "system_config"
    key = Column(String, primary_key=True, index=True)
    value = Column(String)

class ScanTask(Base):
    __tablename__ = "scan_tasks"
    id = Column(String, primary_key=True, index=True) # Celery task ID
    mission_id = Column(Integer, ForeignKey("missions.id"), index=True)
    task_type = Column(String) # 'manual', 'auto', 'custom'
    tool = Column(String, nullable=True) 
    command = Column(String, nullable=True)
    status = Column(String, default="PROGRESS")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    mission = relationship("Mission")
