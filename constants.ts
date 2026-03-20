import { 
  ShieldAlert, 
  Search, 
  FileText, 
  Activity, 
  Server,
  Settings
} from "lucide-react";

export const NAV_ITEMS = [
  { label: 'Dashboard', id: 'dashboard', icon: Activity },
  { label: 'Missions', id: 'missions', icon: Server },
  { label: 'Recon Data', id: 'recon', icon: Search },
  { label: 'Vulnerabilities', id: 'vulns', icon: ShieldAlert },
  { label: 'Reports', id: 'reports', icon: FileText },
];

export const ADMIN_NAV_ITEM = { label: 'Admin Panel', id: 'admin', icon: Settings };
