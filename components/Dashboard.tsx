import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Mission, Criticality, Language } from '../types';
import { translations } from '../translations';

interface DashboardProps {
  missions: Mission[];
  lang: Language;
}

const COLORS = {
  [Criticality.CRITICAL]: '#ef4444', // red-500
  [Criticality.HIGH]: '#f97316', // orange-500
  [Criticality.MEDIUM]: '#eab308', // yellow-500
  [Criticality.LOW]: '#3b82f6', // blue-500
  [Criticality.INFO]: '#64748b', // slate-500
};

export const Dashboard: React.FC<DashboardProps> = ({ missions, lang }) => {
  const t = translations[lang];

  // Aggregate data for charts
  const severityCounts = missions.flatMap(m => m.vulnerabilities).reduce((acc, v) => {
    acc[v.criticality] = (acc[v.criticality] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(severityCounts).map(([name, value]) => ({ name, value }));

  const statusData = missions.map(m => ({
    name: m.name.split(' ').slice(0, 2).join(' '),
    vulns: m.vulnerabilities.length,
    critical: m.vulnerabilities.filter(v => v.criticality === Criticality.CRITICAL).length
  }));

  // Recharts tooltip custom content style
  const tooltipStyle = {
      backgroundColor: 'var(--tw-colors-slate-800)', // Dynamic override in render
      border: 'none',
      borderRadius: '8px',
      color: '#fff'
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg transition-colors">
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">{t.activeMissions}</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{missions.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg transition-colors">
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">{t.totalFindings}</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
            {missions.reduce((acc, m) => acc + m.vulnerabilities.length, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg transition-colors">
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">{t.criticalRisks}</h3>
          <p className="text-3xl font-bold text-red-500 mt-2">
            {missions.flatMap(m => m.vulnerabilities).filter(v => v.criticality === Criticality.CRITICAL).length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg min-h-[400px] transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">{t.severityDist}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.name as Criticality]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                    backgroundColor: 'rgba(30, 41, 59, 0.9)', 
                    border: 'none', 
                    borderRadius: '8px', 
                    color: '#fff' 
                }} 
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg min-h-[400px] transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">{t.findingsPerMission}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                cursor={{fill: 'rgba(148, 163, 184, 0.2)'}} 
                contentStyle={{ 
                    backgroundColor: 'rgba(30, 41, 59, 0.9)', 
                    border: 'none', 
                    borderRadius: '8px', 
                    color: '#fff' 
                }} 
               />
              <Legend />
              <Bar dataKey="vulns" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="critical" name="Critical" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};