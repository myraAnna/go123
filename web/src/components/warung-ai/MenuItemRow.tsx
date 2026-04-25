import { Trash2 } from "lucide-react";

interface MenuItemRowProps {
  index: number;
  name: string;
  price: string;
  onNameChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function MenuItemRow({
  index,
  name,
  price,
  onNameChange,
  onPriceChange,
  onRemove,
  canRemove,
}: MenuItemRowProps) {
  return (
    <div className="flex flex-col gap-3 bg-white rounded-xl border border-[#E0E0E0] p-4">
      {/* Row header */}
      <div className="flex items-center">
        <span className="text-[#9E9E9E] text-[13px] font-semibold flex-1">Item {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="text-[#BDBDBD] hover:text-red-400 transition-colors">
            <Trash2 className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* Item name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[#424242] text-xs font-semibold">Item Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Nasi Lemak"
          className="h-11 w-full rounded-lg bg-[#F5F5F5] border border-[#E0E0E0] px-3 text-sm text-[#1A1A2E] placeholder:text-[#BDBDBD] outline-none focus:border-[#1565C0] focus:bg-white transition-colors"
        />
      </div>

      {/* Price */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[#424242] text-xs font-semibold">Price (RM)</label>
        <div className="flex items-center h-11 rounded-lg bg-[#F5F5F5] border border-[#E0E0E0] px-3 gap-2 focus-within:border-[#1565C0] focus-within:bg-white transition-colors">
          <span className="text-[#9E9E9E] text-sm font-semibold shrink-0">RM</span>
          <div className="w-px h-5 bg-[#E0E0E0]" />
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-sm text-[#1A1A2E] placeholder:text-[#BDBDBD] outline-none"
          />
        </div>
      </div>
    </div>
  );
}
