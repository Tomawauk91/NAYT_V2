import os

with open("backend/app/main.py", "r") as f:
    content = f.read()

# Add imports
content = content.replace(
    "from fastapi import FastAPI, Depends, HTTPException, status",
    "from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect"
)

# Add WebSocket manager logic
ws_code = """

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
"""

# inject at the end of the file or before specific routes
content = content + ws_code

with open("backend/app/main.py", "w") as f:
    f.write(content)
