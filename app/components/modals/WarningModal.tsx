import { AlertTriangle } from 'lucide-react';

export interface WarningModalProps { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; message: React.ReactNode; }

export default function WarningModal({ isOpen, onClose, onConfirm, title, message }: WarningModalProps) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 overflow-y-auto"><div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-xl flex flex-col items-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 mb-4 animate-pulse"><AlertTriangle className="h-10 w-10 text-amber-500" /></div>
                    <h3 className="text-xl font-bold leading-6 text-gray-900 mb-2 text-center">{title}</h3>
                    <div className="mt-2 mb-6 w-full text-center"><p className="text-sm text-gray-500">{message}</p></div>
                    <div className="mt-4 w-full flex gap-3">
                        <button type="button" className="w-full rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 transition-colors" onClick={onClose}>Cancelar</button>
                        <button type="button" className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white shadow-sm hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 transition-colors" onClick={onConfirm}>Sí, continuar</button>
                    </div>
                </div>
            </div></div>
        </div>
    );
}