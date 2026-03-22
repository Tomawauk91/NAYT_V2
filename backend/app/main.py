from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import os
from datetime import datetime
from docxtpl import DocxTemplate

from . import models, schemas, auth, database, tasks
from .database import engine, get_db
from fastapi.security import OAuth2PasswordRequestForm
from .celery_app import celery_app
from celery.result import AsyncResult
from datetime import timedelta

# Create tables
# models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PentestManager Pro API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

@app.on_event("startup")
def startup_event():
    # Wait for DB
    import time
    from sqlalchemy.exc import OperationalError
    
    max_retries = 30
    retry_interval = 2
    
    for i in range(max_retries):
        try:
            # Try to create tables to check connection
            models.Base.metadata.create_all(bind=engine)
            print("Database connected and tables created.")
            break
        except Exception as e:
            print(f"Database connection failed (attempt {i+1}/{max_retries}): {e}")
            time.sleep(retry_interval)
    else:
        print("Could not connect to database after many retries.")

    # Create default user if not exists
    db = database.SessionLocal()
    if not db.query(models.User).filter(models.User.username == "admin").first():
        # Short password to avoid bcrypt 72 bytes limit issue with some versions/encoding
        # "admin" is very short, so it's fine.
        hashed_pwd = auth.get_password_hash("admin")
        user = models.User(username="admin", hashed_password=hashed_pwd, role="Admin")
        db.add(user)
        db.commit()
    db.close()

# --- Auth Routes ---
@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- User Routes ---
@app.get("/users", response_model=List[schemas.UserResponse])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    users = db.query(models.User).offset(skip).limit(limit).all()
    return users

@app.post("/users", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_password, role=user.role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.username == "admin": # Prevent deleting default admin
         raise HTTPException(status_code=400, detail="Cannot delete default admin")
    db.delete(user)
    db.commit()
    return {"status": "success"}

class PasswordReset(BaseModel):
    password: str

@app.put("/users/{user_id}/reset-password")
def reset_password(user_id: int, reset: PasswordReset, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.hashed_password = auth.get_password_hash(reset.password)
    db.commit()
    return {"status": "success"}

# --- Client Routes ---
@app.get("/clients", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.Client).filter(models.Client.user_id == current_user.id).offset(skip).limit(limit).all()

@app.post("/clients", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    client_data = client.dict()
    client_data["user_id"] = current_user.id
    db_client = models.Client(**client_data)
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

@app.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    client = db.query(models.Client).filter(models.Client.id == client_id, models.Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(client)
    db.commit()
    return {"status": "success"}

@app.put("/clients/{client_id}", response_model=schemas.Client)
def update_client(client_id: int, client_update: schemas.ClientUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    client = db.query(models.Client).filter(models.Client.id == client_id, models.Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    update_data = client_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(client, key, value)
        
    db.commit()
    db.refresh(client)
    return client

# --- Mission Routes ---
@app.get("/missions", response_model=List[schemas.Mission])
def read_missions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    missions = db.query(models.Mission).filter(models.Mission.user_id == current_user.id).offset(skip).limit(limit).all()
    return missions

@app.post("/missions", response_model=schemas.Mission)
def create_mission(mission: schemas.MissionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission_data = mission.dict()
    mission_data["user_id"] = current_user.id
    db_mission = models.Mission(**mission_data)
    db.add(db_mission)
    db.commit()
    db.refresh(db_mission)
    return db_mission

@app.put("/missions/{mission_id}", response_model=schemas.Mission)
def update_mission(mission_id: int, mission_update: schemas.MissionUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    update_data = mission_update.dict(exclude_unset=True)
    # Handle explicit null setting for client_id if frontend sends it as None (already handled by exclude_unset=True for omitted fields, but if it's sent as None, it will be included)
    for key, value in update_data.items():
        setattr(mission, key, value)
        
    db.commit()
    db.refresh(mission)
    return mission

@app.delete("/missions/{mission_id}")
def delete_mission(mission_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    db.delete(mission)
    db.commit()
    return {"status": "success"}


@app.put("/vulnerabilities/{vuln_id}", response_model=schemas.Vulnerability)
def update_vulnerability(vuln_id: int, vuln_update: schemas.VulnerabilityUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    vuln = db.query(models.Vulnerability).join(models.Mission).filter(models.Vulnerability.id == vuln_id, models.Mission.user_id == current_user.id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    
    update_data = vuln_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(vuln, key, value)
        
    db.commit()
    db.refresh(vuln)
    return vuln

@app.delete("/vulnerabilities/{vuln_id}")
def delete_vulnerability(vuln_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    vuln = db.query(models.Vulnerability).join(models.Mission).filter(models.Vulnerability.id == vuln_id, models.Mission.user_id == current_user.id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    
    db.delete(vuln)
    db.commit()
    return {"status": "success"}

# --- Scan Routes ---
@app.post("/scan")
def trigger_scan(scan: schemas.ScanRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == scan.mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    # Start the Celery task
    task = tasks.run_scan_task.delay(scan.tool, scan.target, scan.options, scan.mission_id, current_user.username)
    
    db_task = models.ScanTask(id=task.id, mission_id=scan.mission_id, task_type='manual', tool=scan.tool, command=scan.options)
    db.add(db_task)
    db.commit()
    return {"task_id": task.id, "status": "submitted"}

@app.get("/scan/{task_id}")
def get_scan_status(task_id: str, current_user: models.User = Depends(auth.get_current_user)):
    """
    Get the status and result of a scan.
    """
    task_result = AsyncResult(task_id, app=celery_app)
    
    response = {
        "task_id": task_id,
        "status": task_result.status,
        "result": None
    }
    
    if task_result.status == 'SUCCESS':
        response["result"] = task_result.result
    elif task_result.status == 'FAILURE':
        response["result"] = str(task_result.result)
    elif task_result.status == 'PROGRESS':
        # Celery allows valid result/info even in PROGRESS state
        response["result"] = task_result.info
        
    return response

@app.get("/tools")
def list_tools(current_user: models.User = Depends(auth.get_current_user)):
    """
    List available tools in the backend container.
    """
    ts = ["nmap", "nikto", "sqlmap", "dirb", "gobuster", 
          "curl", "wget", "netcat", "dnsrecon", 
          "whatweb", "whois", "dig", "hydra",
          "sslscan", "testssl", "traceroute", 
          "enum4linux", "smbclient", "ftp",
          "amass", "theharvester", "tshark", "suricata", 
          "zaproxy", "ffuf", "nuclei", "aircrack-ng", 
          "netexec", "sslyze", "responder", "hashcat", "john"]
    return {"tools": ts}
    return {"tools": ts}

@app.post("/scan/auto")
def trigger_auto_scan(scan: schemas.AutoScanRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == scan.mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    task = tasks.run_auto_scan_task.delay(scan.target, scan.tools, scan.port, scan.mission_id)
    
    db_task = models.ScanTask(id=task.id, mission_id=scan.mission_id, task_type='auto', tool="auto", command=str(scan.tools))
    db.add(db_task)
    db.commit()
    return {"task_id": task.id, "status": "submitted"}


@app.post("/scan/custom")
def trigger_custom_scan(scan: schemas.CustomCommandRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == scan.mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    task = tasks.run_custom_command_task.delay(scan.command, scan.mission_id)
    
    db_task = models.ScanTask(id=task.id, mission_id=scan.mission_id, task_type='custom', tool="custom", command=scan.command)
    db.add(db_task)
    db.commit()
    return {"task_id": task.id, "status": "submitted"}

@app.get("/missions/{mission_id}/active-tasks")


@app.get("/missions/{mission_id}/tasks")
def get_mission_tasks(mission_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
        
    db_tasks = db.query(models.ScanTask).filter(models.ScanTask.mission_id == mission_id).order_by(models.ScanTask.created_at.asc()).all()
    
    tasks_with_results = []
    for dt in db_tasks:
        res = AsyncResult(dt.id, app=celery_app)
        task_data = {
            "task_id": dt.id,
            "task_type": dt.task_type,
            "tool": dt.tool,
            "command": dt.command,
            "status": res.status,
            "created_at": dt.created_at.isoformat() if dt.created_at else None
        }
        
        output = ""
        if isinstance(res.result, dict):
            output = res.result.get("output", "")
        elif res.status == "SUCCESS" and res.result:
            if isinstance(res.result, dict):
                output = res.result.get("output", "")
            else:
                output = str(res.result)
                
        task_data["output"] = output
        tasks_with_results.append(task_data)
        
    return {"tasks": tasks_with_results}

@app.delete("/missions/{mission_id}/tasks")
def clear_mission_tasks(mission_id: int, task_type: str = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
        
    query = db.query(models.ScanTask).filter(models.ScanTask.mission_id == mission_id)
    if task_type:
        if task_type == 'main':
             query = query.filter(models.ScanTask.task_type.in_(['manual', 'auto']))
        else:
             query = query.filter(models.ScanTask.task_type == task_type)
        
    query.delete(synchronize_session=False)
    db.commit()
    return {"status": "success", "message": "Tasks cleared"}

def get_mission_active_tasks(mission_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Verify mission ownership
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
        
    db_tasks = db.query(models.ScanTask).filter(models.ScanTask.mission_id == mission_id).order_by(models.ScanTask.created_at.desc()).all()
    
    active_tasks = []
    for dt in db_tasks:
        res = AsyncResult(dt.id, app=celery_app)
        # Verify if it's actually still running
        if res.status in ["PENDING", "STARTED", "PROGRESS"]:
            active_tasks.append({
                "task_id": dt.id,
                "task_type": dt.task_type,
                "tool": dt.tool,
                "command": dt.command,
                "status": res.status
            })
            
    return {"active_tasks": active_tasks}

@app.post("/scan/{task_id}/stop")
def stop_scan(task_id: str, current_user: models.User = Depends(auth.get_current_user)):
    """
    Stop a running scan task.
    """
    try:
        celery_app.control.revoke(task_id, terminate=True)
        return {"status": "success", "message": f"Task {task_id} revoked."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Config & Reports ---
class ConfigUpdate(BaseModel):
    key: str
    value: str

@app.post("/admin/config")
def set_config(config: ConfigUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
        
    db_conf = db.query(models.SystemConfig).filter(models.SystemConfig.key == config.key).first()
    if db_conf:
        db_conf.value = config.value
    else:
        db_conf = models.SystemConfig(key=config.key, value=config.value)
        db.add(db_conf)
    
    db.commit()
    return {"status": "updated"}

@app.get("/admin/config/{key}")
def get_config(key: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.username != "admin":
         raise HTTPException(status_code=403, detail="Admin only")
    
    conf = db.query(models.SystemConfig).filter(models.SystemConfig.key == key).first()
    if not conf:
        return {"value": ""}
    return {"value": conf.value}

@app.post("/missions/{mission_id}/report")
def generate_report(mission_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    import google.generativeai as genai
    
    # Check Key
    key_conf = db.query(models.SystemConfig).filter(models.SystemConfig.key == "gemini_api_key").first()
    if not key_conf or not key_conf.value:
         raise HTTPException(status_code=400, detail="Gemini API Key not configured")
         
    # Fetch Mission Data
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
         raise HTTPException(status_code=404, detail="Mission not found")
         
    # Generate
    try:
        genai.configure(api_key=key_conf.value)
        model = genai.GenerativeModel('gemini-pro')
        
        prompt = f"Write an executive summary for a pentest mission on target {mission.target}. Findings count: {len(mission.vulnerabilities)}."
        response = model.generate_content(prompt)
        return {"report": response.text}
    except Exception as e:
        # Fallback if key invalid or API error
        return {"report": f"Error generating report: {str(e)}"}

@app.get("/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        if username not in self.active_connections:
            self.active_connections[username] = []
            await self.broadcast({"type": "user_connected", "username": username, "users": list(self.active_connections.keys())}, exclude=username)
        self.active_connections[username].append(websocket)
        await websocket.send_json({"type": "sync_users", "users": list(self.active_connections.keys())})

    def disconnect(self, websocket: WebSocket, username: str):
        if username in self.active_connections:
            if websocket in self.active_connections[username]:
                self.active_connections[username].remove(websocket)
            if len(self.active_connections[username]) == 0:
                del self.active_connections[username]
                return True
        return False

    async def broadcast(self, message: dict, exclude: str = None):
        for user, connections in self.active_connections.items():
            if exclude and user == exclude:
                continue
            for connection in connections:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

ws_manager = ConnectionManager()

@app.websocket("/ws/users/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await ws_manager.connect(websocket, username)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        fully_disconnected = ws_manager.disconnect(websocket, username)
        if fully_disconnected:
            await ws_manager.broadcast({"type": "user_disconnected", "username": username, "users": list(ws_manager.active_connections.keys())})


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        if username not in self.active_connections:
            self.active_connections[username] = []
            await self.broadcast({"type": "user_connected", "username": username, "users": list(self.active_connections.keys())}, exclude=username)
        self.active_connections[username].append(websocket)
        await websocket.send_json({"type": "sync_users", "users": list(self.active_connections.keys())})

    def disconnect(self, websocket: WebSocket, username: str):
        if username in self.active_connections:
            if websocket in self.active_connections[username]:
                self.active_connections[username].remove(websocket)
            if len(self.active_connections[username]) == 0:
                del self.active_connections[username]
                return True
        return False

    async def broadcast(self, message: dict, exclude: str = None):
        for user, connections in self.active_connections.items():
            if exclude and user == exclude:
                continue
            for connection in connections:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

ws_manager = ConnectionManager()

@app.websocket("/ws/users/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await ws_manager.connect(websocket, username)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        fully_disconnected = ws_manager.disconnect(websocket, username)
        if fully_disconnected:
            await ws_manager.broadcast({"type": "user_disconnected", "username": username, "users": list(ws_manager.active_connections.keys())})

# Mathematical Mapping for severity to CVSS
SEVERITY_WEIGHTS = {
    "Critical": 9.5,
    "High": 8.0,
    "Medium": 5.5,
    "Low": 3.0,
    "Info": 0.0
}

@app.get("/missions/{mission_id}/report", response_class=FileResponse)
def generate_mission_report(mission_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id, models.Mission.user_id == current_user.id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    client_name = mission.client.name if mission.client else "Unknown Client"
    client_company = mission.client.company if mission.client and mission.client.company else "N/A"

    # Fetch vulnerabilities
    vulns = db.query(models.Vulnerability).filter(models.Vulnerability.mission_id == mission_id).all()

    # Step 2: Calculate Mathematical Stats
    stats = {
        "Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Info": 0
    }
    
    total_score = 0.0
    vulns_data = []

    for v in vulns:
        severity = v.severity if v.severity in stats else "Info"
        stats[severity] += 1
        
        # Extrapolate a pseudo-CVSS if none exists
        cvss = SEVERITY_WEIGHTS.get(severity, 0.0)
        total_score += cvss
        
        vulns_data.append({
            "title": v.title or "Untitled",
            "severity": v.severity or "Info",
            "cvss": str(cvss),
            "status": v.status or "Open",
            "description": v.description or "No description",
            "evidence": v.evidence or ""
        })

    total_vulns = len(vulns)
    max_possible_score = total_vulns * 10.0 if total_vulns > 0 else 1.0
    overall_risk_score = round((total_score / max_possible_score) * 100, 2) if total_vulns > 0 else 0

    # Step 3: Render Docx Template
    template_path = os.path.join(os.path.dirname(__file__), "report_template.docx")
    
    if not os.path.exists(template_path):
        raise HTTPException(status_code=500, detail="Report template not found")

    doc = DocxTemplate(template_path)
    
    context = {
        "mission_name": mission.name,
        "client_name": client_name,
        "client_company": client_company,
        "target": mission.target,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "total_vulnerabilities": total_vulns,
        "critical_count": stats["Critical"],
        "high_count": stats["High"],
        "medium_count": stats["Medium"],
        "low_count": stats["Low"],
        "info_count": stats["Info"],
        "overall_risk_score": overall_risk_score,
        "vulnerabilities": vulns_data
    }
    
    doc.render(context)
    
    # Save the generated report
    os.makedirs("/app/reports", exist_ok=True)
    out_filename = f"{mission.name}_{client_name}_{datetime.now().strftime('%Y-%m-%d')}.docx".replace(' ', '_')
    out_path = os.path.join("/app/reports", out_filename)
    
    doc.save(out_path)
    
    return FileResponse(path=out_path, filename=out_filename, media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')



@app.websocket("/ws/scan/{task_id}")
async def websocket_scan_endpoint(websocket: WebSocket, task_id: str):
    await websocket.accept()
    import redis.asyncio as aioredis
    import json
    import asyncio
    
    redis_client = aioredis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(f"scan_logs_{task_id}")
    
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                try:
                    data_str = message['data'].decode('utf-8')
                    await websocket.send_text(data_str)
                    
                    data = json.loads(data_str)
                    if data.get("type") == "status":
                        break
                except Exception as e:
                    print(f"WS send error: {e}")
            else:
                await asyncio.sleep(0.1)
    except Exception as e:
        pass
    finally:
        await pubsub.unsubscribe(f"scan_logs_{task_id}")
        await redis_client.close()
        try:
            await websocket.close()
        except:
            pass
