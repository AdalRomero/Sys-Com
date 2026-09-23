
type BannerProps = {
  type: 'error' | 'success' | 'info';
  message: string;
  onClose?: () => void;
};

export default function Banner({ type, message, onClose }: BannerProps) {
  if (!message) return null;

  const baseClasses = "relative w-full p-3 mb-4 rounded-lg flex items-center justify-between text-sm transition-all duration-300 text-left";
  const typeClasses = {
    error: "bg-red-500/10 text-red-500 border border-red-500/30",
    success: "bg-green-500/10 text-green-500 border border-green-500/30",
    info: "bg-blue-500/10 text-blue-500 border border-blue-500/30"
  };

  return (
    <div className={`${baseClasses} ${typeClasses[type]} animate-fade-in`}>
      <span>{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="ml-4 font-bold hover:opacity-70 text-lg leading-none">
          &times;
        </button>
      )}
    </div>
  );
}
