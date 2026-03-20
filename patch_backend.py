import re

with open("backend/app/models.py", "r") as f:
    models_content = f.read()

if "role = Column(String, default=\"Viewer\")" not in models_content:
    models_content = models_content.replace(
        "hashed_password = Column(String)",
        "hashed_password = Column(String)\n    role = Column(String, default=\"Viewer\")"
    )
    with open("backend/app/models.py", "w") as f:
        f.write(models_content)
    print("Modified models.py")

with open("backend/app/schemas.py", "r") as f:
    schemas_content = f.read()

if "role: str" not in schemas_content:
    schemas_content = schemas_content.replace(
        "class UserCreate(BaseModel):\n    username: str\n    password: str",
        "class UserCreate(BaseModel):\n    username: str\n    password: str\n    role: str = \"Viewer\""
    )
    schemas_content = schemas_content.replace(
        "class UserResponse(BaseModel):\n    id: int\n    username: str",
        "class UserResponse(BaseModel):\n    id: int\n    username: str\n    role: str"
    )
    with open("backend/app/schemas.py", "w") as f:
        f.write(schemas_content)
    print("Modified schemas.py")

with open("backend/app/main.py", "r") as f:
    main_content = f.read()

if "role=user.role" not in main_content:
    # Set default admin role
    main_content = main_content.replace(
        "user = models.User(username=\"admin\", hashed_password=hashed_pwd)",
        "user = models.User(username=\"admin\", hashed_password=hashed_pwd, role=\"Admin\")"
    )
    # Include role when creating user
    main_content = main_content.replace(
        "db_user = models.User(username=user.username, hashed_password=hashed_password)",
        "db_user = models.User(username=user.username, hashed_password=hashed_password, role=user.role)"
    )
    
    # Send role in Token
    # wait, schemas.Token doesn't have role. We can return an endpoint to get "me" or add it to the token response
    # It might be easier to just add an endpoint to get the current user profile.

    with open("backend/app/main.py", "w") as f:
        f.write(main_content)
    print("Modified main.py")
