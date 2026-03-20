export enum Role {
  ADMIN = 'Admin',
  PENTESTER = 'Pentester',
  VIEWER = 'Viewer',
}

export enum Criticality {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
  INFO = 'Info',
}

export enum Status {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  REMEDIATED = 'Remediated',
  ACCEPTED_RISK = 'Accepted Risk',
}

export type Language = 'en' | 'fr';
export type Theme = 'light' | 'dark';

export interface Vulnerability {
  id: string;
  title: string;
  description: string;
  criticality: Criticality;
  status: Status;
  dateFound: string;
}

export interface Mission {
  id: string;
  name: string;
  target: string;
  progress: number;
  status: 'Planning' | 'Recon' | 'Scanning' | 'Exploitation (Sim)' | 'Reporting';
  vulnerabilities: Vulnerability[];
}

export interface User {
  id: string;
  username: string;
  role: Role;
  lastLogin: string;
  password?: string; // In a real app, this would be a hash
  isTempPassword?: boolean;
}

export interface Notification {
  id: string;
  type: 'success' | 'error';
  message: string;
  duration?: number;
}

export interface IpRange {
  id: string;
  cidr: string;
  description: string;
}
