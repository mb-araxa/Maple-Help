'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

interface NotificationBellProps {
  notifications?: NotificationItem[];
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
}

export function NotificationBell({ 
  notifications = [], 
  onMarkAsRead,
  onMarkAllAsRead
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full text-text-muted hover:text-brand hover:bg-surface-muted transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
        aria-label={`Notificações. ${unreadCount} não lidas.`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-brand rounded-full ring-2 ring-surface border border-transparent"></span>
        )}
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-80 bg-surface rounded-xl shadow-xl border border-border z-50 overflow-hidden flex flex-col"
          role="menu"
          aria-orientation="vertical"
          aria-label="Lista de notificações"
        >
          <div className="flex items-center justify-between p-4 border-b border-border bg-surface-muted">
            <h3 className="font-bold text-text">Notificações</h3>
            {unreadCount > 0 && onMarkAllAsRead && (
              <button 
                onClick={() => {
                  onMarkAllAsRead();
                  setIsOpen(false);
                }}
                className="text-xs text-brand hover:underline font-medium focus:outline-none focus:underline"
              >
                Marcar todas lidas
              </button>
            )}
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-text-subtle text-sm">
                Nenhuma notificação no momento.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((notif) => (
                  <li key={notif.id} className={`p-4 hover:bg-surface-muted transition-colors ${!notif.read ? 'bg-brand/5' : ''}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-sm font-bold ${!notif.read ? 'text-text' : 'text-text-muted'}`}>
                        {notif.title}
                      </span>
                      {!notif.read && <span className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1.5" aria-hidden="true" />}
                    </div>
                    <p className="text-xs text-text-subtle line-clamp-2 mb-2">
                      {notif.message}
                    </p>
                    <div className="flex justify-between items-center text-[10px] text-text-muted">
                      <span>{new Date(notif.createdAt).toLocaleString('pt-BR')}</span>
                      {notif.link && (
                        <Link 
                          href={notif.link}
                          onClick={() => {
                            if (!notif.read && onMarkAsRead) onMarkAsRead(notif.id);
                            setIsOpen(false);
                          }}
                          className="text-brand font-medium hover:underline focus:outline-none focus:underline"
                        >
                          Ver detalhes
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
