import { CheckCircle2 } from 'lucide-react';

export interface SuccessModalProps { isOpen: boolean; onClose: () => void; title: string; message: React.ReactNode; }

export default function SuccessModal({ isOpen, onClose, title, message }: SuccessModalProps) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 overflow-y-auto"><div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-xl flex flex-col items-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4"><CheckCircle2 className="h-10 w-10 text-green-600 animate-bounce" /></div>
                    <h3 className="text-xl font-bold leading-6 text-gray-900 mb-2 text-center">{title}</h3>
                    <div className="mt-2 mb-6 w-full text-center"><p className="text-sm text-gray-500">{message}</p></div>
                    <div className="mt-4 w-full"><button type="button" className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-green-700 hover:-translate-y-1 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2" onClick={onClose}>Aceptar</button></div>
                </div>
            </div></div>
        </div>
    );
}