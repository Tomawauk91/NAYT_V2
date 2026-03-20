from backend.app import database, models, auth
db = database.SessionLocal()
user = db.query(models.User).filter(models.User.username == "admin").first()
if user:
    print("Admin found! Resetting password to 'admin'")
    user.hashed_password = auth.get_password_hash("admin")
    db.commit()
else:
    print("Admin not found! Creating...")
    user = models.User(username="admin", hashed_password=auth.get_password_hash("admin"))
    db.add(user)
    db.commit()
print("Done")
