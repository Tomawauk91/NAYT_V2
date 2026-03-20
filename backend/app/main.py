from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
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

# --- Mission Routes ---
@app.get("/missions", response_model=List[schemas.Mission])
def read_missions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    missions = db.query(models.Mission).offset(skip).limit(limit).all()
    return missions

@app.post("/missions", response_model=schemas.Mission)
def create_mission(mission: schemas.MissionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_mission = models.Mission(**mission.dict())
    db.add(db_mission)
    db.commit()
    db.refresh(db_mission)
    return db_mission

@app.delete("/missions/{mission_id}")
def delete_mission(mission_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    db.delete(mission)
    db.commit()
    return {"status": "success"}

# --- Scan Routes ---
@app.post("/scan")
def trigger_scan(scan: schemas.ScanRequest, current_user: models.User = Depends(auth.get_current_user)):
    """
    Trigger a security scan using one of the available tools.
    """
    # Start the Celery task
    task = tasks.run_scan_task.delay(scan.tool, scan.target, scan.options)
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
def trigger_auto_scan(scan: schemas.AutoScanRequest, current_user: models.User = Depends(auth.get_current_user)):
    task = tasks.run_auto_scan_task.delay(scan.target, scan.tools, scan.port)
    return {"task_id": task.id, "status": "submitted"}


@app.post("/scan/custom")
def trigger_custom_scan(scan: schemas.CustomCommandRequest, current_user: models.User = Depends(auth.get_current_user)):
    task = tasks.run_custom_command_task.delay(scan.command)
    return {"task_id": task.id, "status": "submitted"}

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
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id).first()
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
