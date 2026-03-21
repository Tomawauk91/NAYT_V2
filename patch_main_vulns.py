with open('backend/app/main.py', 'r') as f:
    content = f.read()

vulns_endpoints = """
@app.put("/vulnerabilities/{vuln_id}", response_model=schemas.Vulnerability)
def update_vulnerability(vuln_id: int, vuln_update: schemas.VulnerabilityUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    vuln = db.query(models.Vulnerability).filter(models.Vulnerability.id == vuln_id).first()
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
    vuln = db.query(models.Vulnerability).filter(models.Vulnerability.id == vuln_id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    
    db.delete(vuln)
    db.commit()
    return {"status": "success"}
"""

content = content.replace(
    '# --- Scan Routes ---',
    vulns_endpoints + '\n# --- Scan Routes ---'
)

with open('backend/app/main.py', 'w') as f:
    f.write(content)
