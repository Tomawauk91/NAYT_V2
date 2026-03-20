const fs = require("fs");
let content = fs.readFileSync("App.tsx", "utf8");

content = content.replace(
    `<div className="flex justify-end">
                        <button 
                            onClick={() => setShowNewMission(true)}`,
    `{user.role !== 'Viewer' && user.role !== 'viewer' && user.role !== 'VIEWER' && (
                    <div className="flex justify-end">
                        <button 
                            onClick={() => setShowNewMission(true)}`
);

content = content.replace(
    `<Plus size={16} /> {t.newMission}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4">`,
    `<Plus size={16} /> {t.newMission}
                        </button>
                    </div>
                    )}
                    <div className="grid grid-cols-1 gap-4">`
);

// also hide delete mission button
content = content.replace(
    `<button
                                onClick={(e) => handleDeleteMission(e, mission.id)}`,
    `{(user.role === Role.ADMIN || user.role === 'Admin' || user.role === 'admin') && <button
                                onClick={(e) => handleDeleteMission(e, mission.id)}`
);
content = content.replace(
    `<Trash2 size={16} />
                            </button>
                            <div className="flex items-start justify-between mb-4">`,
    `<Trash2 size={16} />
                            </button>}
                            <div className="flex items-start justify-between mb-4">`
);

fs.writeFileSync("App.tsx", content);
console.log("App.tsx new mission hidden for viewers");
