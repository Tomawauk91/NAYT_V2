const fs = require("fs");
let content = fs.readFileSync("App.tsx", "utf8");

content = content.replace(
    `{(user.role === Role.ADMIN || user.role === Role.PENTESTER) && {user.role !== 'Viewer' && user.role !== 'viewer' && user.role !== 'VIEWER' && (
                    <div className="flex justify-end">`,
    `{user.role !== 'Viewer' && user.role !== 'viewer' && user.role !== 'VIEWER' && (
                    <div className="flex justify-end">`
);

let changed = false;
if (content.includes(`{(user.role === Role.ADMIN || user.role === Role.PENTESTER) && <div className="flex justify-end">`)) {
    content = content.replace(`{(user.role === Role.ADMIN || user.role === Role.PENTESTER) && <div className="flex justify-end">`, `{user.role !== 'Viewer' && user.role !== 'viewer' && user.role !== 'VIEWER' && <div className="flex justify-end">`);
    changed = true;
}

fs.writeFileSync("App.tsx", content);
console.log("App.tsx fixed");
