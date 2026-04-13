import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { Notification } from '../types';

interface NotificationSystemProps {
  notifications: Notification[];
  removeNotification: (id: string) => void;
}

const Toast: React.FC<{ note: Notification; onDismiss: () => void }> = ({ note, onDismiss }) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const duration = note.duration || 5000;
    const intervalTime = 50; 
    const steps = duration / intervalTime;
    const decrement = 100 / steps;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - decrement;
        if (next <= 0) {
          clearInterval(timer);
          onDismiss(); // Dismiss immediately when progress hits 0
          return 0;
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [note, onDismiss]);

  return (
    <div className="relative w-80 bg-slate-800 border border-slate-700 shadow-xl rounded-lg overflow-hidden animate-slideInLeft mb-3">
      <div className="p-4 flex items-start gap-3">
        {note.type === 'success' ? (
          <CheckCircle className="text-emerald-500 shrink-0" size={24} />
        ) : note.type === 'info' ? (
          <Info className="text-blue-500 shrink-0" size={24} />
        ) : (
          <XCircle className="text-red-500 shrink-0" size={24} />
        )}
        <div className="flex-1">
          <h4 className={`font-semibold text-sm ${note.type === 'success' ? 'text-emerald-400' : note.type === 'info' ? 'text-blue-400' : 'text-red-400'}`}>
            {note.type === 'success' ? 'Success' : note.type === 'info' ? 'Info' : 'Error'}
          </h4>
          <p className="text-slate-300 text-sm mt-1">{note.message}</p>
        </div>
        <button onClick={onDismiss} className="text-slate-500 hover:text-white">
          <X size={16} />
        </button>
      </div>
      {/* Progress Bar */}
      <div className="w-full h-1 bg-slate-900/50 absolute bottom-0 left-0">
        <div 
          className={`h-full transition-all duration-75 ease-linear ${
            note.type === 'success' ? 'bg-emerald-500' : note.type === 'info' ? 'bg-blue-500' : 'bg-red-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export const NotificationSystem: React.FC<NotificationSystemProps> = ({ notifications, removeNotification }) => {
  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col-reverse">
      {notifications.map((note) => (
        <Toast key={note.id} note={note} onDismiss={() => removeNotification(note.id)} />
      ))}
    </div>
  );
};
