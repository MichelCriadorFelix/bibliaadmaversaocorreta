import React from 'react';

export default function Toast({ message, type, onClose }: any) {
  const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800';
  return (
    <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white shadow-xl z-50 ${bg} flex items-center gap-3 animate-bounce`}>
      <span>{message}</span>
      <button onClick={onClose} className="font-bold">✕</button>
    </div>
  );
}