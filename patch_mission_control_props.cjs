const fs = require("fs");

let content = fs.readFileSync("components/MissionControl.tsx", "utf8");

content = content.replace(
    "interface MissionControlProps {\n  mission: Mission;\n  onBack: () => void;\n  notify: (type: 'success' | 'error', message: string) => void;\n  lang: Language;\n}",
    "interface MissionControlProps {\n  mission: Mission;\n  onBack: () => void;\n  notify: (type: 'success' | 'error', message: string) => void;\n  lang: Language;\n  userRole: string;\n}"
);

content = content.replace(
    "export const MissionControl: React.FC<MissionControlProps> = ({ mission, onBack, notify, lang }) => {",
    "export const MissionControl: React.FC<MissionControlProps> = ({ mission, onBack, notify, lang, userRole }) => {"
);

// We need to filter tabs if userRole === 'Viewer'
const tabDef = `        ].map((tab) => (`;
// We want to dynamically define tabs:
const newTabDef = `        ].filter(tab => !((userRole === 'Viewer' || userRole === 'viewer' || userRole === 'VIEWER') && (tab.id === 'actions' || tab.id === 'custom' || tab.id === 'auto'))).map((tab) => (`;

content = content.replace(tabDef, newTabDef);

fs.writeFileSync("components/MissionControl.tsx", content);
console.log("MissionControl updated");
