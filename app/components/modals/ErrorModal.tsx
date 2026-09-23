import { XCircle } from 'lucide-react';

export interface ErrorModalProps { isOpen: boolean; onClose: () => void; title: string; message: React.ReactNode; }

export default function ErrorModal({ isOpen, onClose, title, message }: ErrorModalProps) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 overflow-y-auto"><div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-xl flex flex-col items-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4"><XCircle className="h-10 w-10 text-red-500 animate-bounce" /></div>
                    <h3 className="text-xl font-bold leading-6 text-gray-900 mb-2 text-center">{title}</h3>
                    <div className="mt-2 mb-6 w-full text-center"><p className="text-sm text-gray-500">{message}</p></div>
                    <div className="mt-4 w-full"><button type="button" className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 hover:-translate-y-1 active:scale-95 transition-all duration-200" onClick={onClose}>Entendido</button></div>
                </div>
            </div></div>
        </div>
    );
}