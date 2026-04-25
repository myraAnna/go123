export function Header() {
  return (
    <div className="flex items-center justify-between h-12">
      <h1 className="text-white text-xl font-bold">All Services</h1>
      <div className="flex items-center gap-2.5">
        <button className="w-9 h-9 rounded-full bg-[#1E60DC] flex items-center justify-center text-white text-sm leading-none">
          ···
        </button>
        <button className="w-9 h-9 rounded-full bg-[#1E60DC] flex items-center justify-center text-white text-sm leading-none">
          ✕
        </button>
      </div>
    </div>
  );
}
