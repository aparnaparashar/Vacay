"use client";

import { useTripData } from "@/context/TripContext";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";

// Types
type PackingItem = {
  id: string;
  name: string;
  quantity: string;
  checked: boolean;
};

type PackingCategory = {
  id: string;
  name: string;
  items: PackingItem[];
  isExpanded: boolean;
};

export default function ListsPage() {
  const { tripData } = useTripData();
  const [categories, setCategories] = useState<PackingCategory[]>([]);
  const [filter, setFilter] = useState<'All' | 'Open' | 'Done'>('All');
  
  // Edit states
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItemCategoryId, setNewItemCategoryId] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  useEffect(() => {
    if (tripData?.packing?.categories && categories.length === 0) {
      const initialCats = tripData.packing.categories.map((cat: any, cIdx: number) => ({
        id: `cat-${cIdx}-${Date.now()}`,
        name: cat.name || "CATEGORY",
        isExpanded: true,
        items: (cat.items || []).map((item: any, iIdx: number) => {
          const itemName = typeof item === 'string' ? item : (item.name || item.item);
          const itemQuantity = typeof item === 'object' && item.quantity ? item.quantity : "1";
          return {
            id: `item-${cIdx}-${iIdx}-${Date.now()}`,
            name: itemName,
            quantity: itemQuantity,
            checked: false
          };
        })
      }));
      setCategories(initialCats);
    }
  }, [tripData, categories.length]);

  if (!tripData?.packing?.categories) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-104px)] text-center text-gray-500">
        <span className="material-symbols-outlined text-6xl mb-4 opacity-50">luggage</span>
        <h2 className="text-xl font-bold text-gray-700">No Packing List Yet</h2>
        <p className="text-sm mt-2">Generate a trip first to get your AI-powered smart packing list.</p>
      </div>
    );
  }

  const categoryColors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#6366F1"];

  // Stats
  const totalItems = categories.reduce((acc, cat) => acc + cat.items.length, 0);
  const completedItems = categories.reduce((acc, cat) => acc + cat.items.filter(i => i.checked).length, 0);
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // Handlers
  const toggleCheck = (catId: string, itemId: string) => {
    setCategories(prev => prev.map(c => c.id === catId ? {
      ...c,
      items: c.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i)
    } : c));
  };

  const deleteItem = (catId: string, itemId: string) => {
    setCategories(prev => prev.map(c => c.id === catId ? {
      ...c,
      items: c.items.filter(i => i.id !== itemId)
    } : c));
  };

  const toggleCategoryExpand = (catId: string) => {
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, isExpanded: !c.isExpanded } : c));
  };

  const addCategory = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setIsAddingCategory(false);
      return;
    }
    setCategories(prev => [...prev, {
      id: `cat-${Date.now()}`,
      name: trimmedName.toUpperCase(),
      items: [],
      isExpanded: true
    }]);
    setIsAddingCategory(false);
    toast.success(`"${trimmedName}" has been added to your shared list!`);
  };

  const addItem = (catId: string, name: string) => {
    if (!name.trim()) {
      setNewItemCategoryId(null);
      return;
    }
    setCategories(prev => prev.map(c => c.id === catId ? {
      ...c,
      items: [...c.items, {
        id: `item-${Date.now()}`,
        name: name.trim(),
        quantity: "1",
        checked: false
      }]
    } : c));
    setNewItemCategoryId(null);
  };

  const updateItemName = (catId: string, itemId: string, newName: string) => {
    if (newName.trim()) {
      setCategories(prev => prev.map(c => c.id === catId ? {
        ...c,
        items: c.items.map(i => i.id === itemId ? { ...i, name: newName.trim() } : i)
      } : c));
    }
    setEditingItemId(null);
  };
  
  const updateCategoryName = (catId: string, newName: string) => {
    if (newName.trim()) {
       setCategories(prev => prev.map(c => c.id === catId ? { ...c, name: newName.trim() } : c));
    }
  }

  // Derived filtered categories
  const filteredCategories = categories.map(cat => ({
    ...cat,
    items: cat.items.filter(i => {
      if (filter === 'All') return true;
      if (filter === 'Open') return !i.checked;
      if (filter === 'Done') return i.checked;
      return true;
    })
  })).filter(cat => cat.items.length > 0 || filter === 'All');

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6 animate-fade-in pb-12 pt-[136px] px-8 text-[#111827]">
      
      {/* Header Section */}
      <div className="bg-[#F8F9FA] rounded-[20px] p-4 flex items-center justify-between border border-gray-100">
        <div className="flex items-center gap-6">
          <h2 className="text-2xl font-black tracking-tight">Lists</h2>
          
          <div className="flex gap-2 bg-white rounded-full p-1 border border-gray-200">
            <button className="flex items-center gap-2 bg-white text-gray-900 px-4 py-1.5 rounded-full text-sm font-bold shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
              <span className="material-symbols-outlined text-[18px]">inventory_2</span>
              Packing List <span className="bg-gray-100 text-gray-500 px-1.5 rounded-full text-[10px]">{totalItems}</span>
            </button>
            <button className="flex items-center gap-2 text-gray-500 px-4 py-1.5 rounded-full text-sm font-bold hover:bg-gray-50 transition-colors">
              <span className="material-symbols-outlined text-[18px]">checklist</span>
              To-Do <span className="bg-gray-100 px-1.5 rounded-full text-[10px]">0</span>
            </button>
          </div>
        </div>

        <button className="bg-[#E67E22] hover:bg-[#d6711c] text-white px-5 py-2 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 transition-colors">
          <span className="material-symbols-outlined text-[18px]">publish</span>
          Import
        </button>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center gap-4 py-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black">{completedItems}</span>
          <span className="text-gray-400 font-bold">/{totalItems}</span>
        </div>
        <div className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded-md">{progressPercent}%</div>
        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#E67E22] rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }}></div>
        </div>
      </div>

      {/* Add Category Placeholder */}
      {isAddingCategory ? (
        <div className="w-full border-2 border-dashed border-gray-200 rounded-xl p-3 flex items-center gap-3 bg-white shadow-sm">
          <span className="material-symbols-outlined text-[20px] text-gray-400 pl-1">create_new_folder</span>
          <input
            id="new-category-input"
            autoFocus
            placeholder="Type category name..."
            onKeyDown={(e) => { if(e.key === 'Enter') addCategory(e.currentTarget.value) }}
            className="text-sm font-bold text-gray-900 bg-transparent outline-none w-full uppercase placeholder:normal-case placeholder:font-normal"
          />
          <button 
            onClick={() => {
              const input = document.getElementById('new-category-input') as HTMLInputElement;
              if(input) addCategory(input.value);
            }}
            className="bg-[#E67E22] hover:bg-[#d6711c] text-white p-1.5 rounded-lg flex items-center justify-center transition-colors shrink-0"
            title="Add Category"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
          <button 
            onClick={() => setIsAddingCategory(false)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-500 p-1.5 rounded-lg flex items-center justify-center transition-colors shrink-0"
            title="Cancel"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ) : (
        <button 
          onClick={() => setIsAddingCategory(true)}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-gray-400 font-bold flex items-center gap-2 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-600 transition-all text-sm"
        >
          <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
          Add category
        </button>
      )}

      {/* Filters */}
      <div className="flex items-center gap-6 py-2">
        <div className="flex gap-2">
          <button className="bg-[#1C1C1E] text-white px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">group</span>
            Shared <span className="bg-white text-black px-1.5 rounded-full text-[10px]">{categories.length}</span>
          </button>
          <button className="bg-white border border-gray-200 text-gray-600 px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-gray-50">
            <span className="material-symbols-outlined text-[16px]">person</span>
            My list <span className="bg-gray-100 px-1.5 rounded-full text-[10px]">0</span>
          </button>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={() => setFilter('All')} 
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${filter === 'All' ? 'bg-[#1C1C1E] text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('Open')} 
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${filter === 'Open' ? 'bg-[#1C1C1E] text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Open
          </button>
          <button 
            onClick={() => setFilter('Done')} 
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${filter === 'Done' ? 'bg-[#1C1C1E] text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Done
          </button>
        </div>
      </div>
      
      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCategories.map((cat, idx) => {
          const color = categoryColors[idx % categoryColors.length];
          const completedInCat = cat.items.filter(i => i.checked).length;
          const totalInCat = cat.items.length;
          
          return (
            <div key={cat.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 flex flex-col self-start">
              {/* Category Header */}
              <div className="flex items-center justify-between mb-4 group">
                <div className="flex items-center gap-2 flex-1">
                  <span 
                    onClick={() => toggleCategoryExpand(cat.id)}
                    className="material-symbols-outlined text-gray-400 text-[20px] cursor-pointer hover:text-gray-700 transition-colors select-none"
                  >
                    {cat.isExpanded ? 'expand_more' : 'chevron_right'}
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }}></div>
                  <input
                    type="text"
                    defaultValue={cat.name}
                    onBlur={(e) => updateCategoryName(cat.id, e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') e.currentTarget.blur() }}
                    className="text-sm font-black text-gray-900 tracking-wider uppercase ml-1 bg-transparent border-none outline-none hover:bg-gray-50 focus:bg-gray-50 rounded px-1 w-full"
                  />
                </div>
                
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className="text-xs font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md">
                    {completedInCat}/{totalInCat}
                  </span>
                  <span className="material-symbols-outlined text-gray-400 text-[18px] cursor-pointer hover:text-gray-700 transition-colors">
                    more_horiz
                  </span>
                </div>
              </div>
              
              {/* Items List */}
              {cat.isExpanded && (
                <div className="flex flex-col gap-1">
                  {cat.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between group/item hover:bg-gray-50 p-2 -mx-2 rounded-lg transition-colors cursor-pointer">
                      
                      {/* Left: Checkbox & Name */}
                      <div className="flex items-center gap-3 flex-1 overflow-hidden pr-2">
                        <div className="w-4 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <span className="material-symbols-outlined text-gray-300 text-[16px] cursor-grab">drag_indicator</span>
                        </div>
                        
                        <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                          <input 
                            type="checkbox" 
                            checked={item.checked}
                            onChange={() => toggleCheck(cat.id, item.id)}
                            className="peer appearance-none w-5 h-5 border-2 border-gray-300 rounded-[4px] bg-white checked:bg-gray-900 checked:border-gray-900 transition-colors cursor-pointer"
                          />
                          <span className="material-symbols-outlined absolute text-white text-[14px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity font-bold">check</span>
                        </div>
                        
                        {editingItemId === item.id ? (
                          <input
                            autoFocus
                            defaultValue={item.name}
                            onBlur={(e) => updateItemName(cat.id, item.id, e.target.value)}
                            onKeyDown={(e) => { if(e.key === 'Enter') e.currentTarget.blur() }}
                            className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-0.5 w-full outline-none"
                          />
                        ) : (
                          <p 
                            className={`text-sm font-semibold truncate transition-colors ${item.checked ? 'line-through text-gray-400' : 'text-gray-900 group-hover/item:text-black'}`}
                            onClick={() => toggleCheck(cat.id, item.id)}
                          >
                            {item.name}
                          </p>
                        )}
                      </div>

                      {/* Right: Actions & Quantity */}
                      <div className="flex items-center gap-3 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                        <span className="text-[11px] font-bold text-gray-600 border border-gray-200 px-2 py-0.5 rounded-md bg-white select-none">
                          {item.quantity}x
                        </span>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}></div>
                        <span 
                          onClick={(e) => { e.stopPropagation(); setEditingItemId(item.id); }}
                          className="material-symbols-outlined text-[14px] text-gray-400 hover:text-gray-900 transition-colors p-1"
                          title="Edit Item"
                        >
                          edit
                        </span>
                        <span 
                          onClick={(e) => { e.stopPropagation(); deleteItem(cat.id, item.id); }}
                          className="material-symbols-outlined text-[14px] text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Delete Item"
                        >
                          delete
                        </span>
                      </div>

                    </div>
                  ))}
                  
                  {/* New Item Input */}
                  {newItemCategoryId === cat.id && (
                    <div className="flex items-center gap-3 p-2 -mx-2 bg-gray-50 rounded-lg border border-gray-100">
                       <div className="w-4 shrink-0"></div>
                       <div className="w-5 h-5 shrink-0"></div>
                       <input
                          id={`new-item-input-${cat.id}`}
                          autoFocus
                          placeholder="Type item name..."
                          onKeyDown={(e) => { if(e.key === 'Enter') addItem(cat.id, e.currentTarget.value) }}
                          className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1.5 w-full outline-none focus:border-blue-500"
                       />
                       <button 
                         onClick={() => {
                           const input = document.getElementById(`new-item-input-${cat.id}`) as HTMLInputElement;
                           if(input) addItem(cat.id, input.value);
                         }}
                         className="bg-blue-500 hover:bg-blue-600 text-white p-1 rounded-md flex items-center justify-center transition-colors shrink-0"
                         title="Add Item"
                       >
                         <span className="material-symbols-outlined text-[16px]">check</span>
                       </button>
                       <button 
                         onClick={() => setNewItemCategoryId(null)}
                         className="bg-gray-200 hover:bg-gray-300 text-gray-600 p-1 rounded-md flex items-center justify-center transition-colors shrink-0"
                         title="Cancel"
                       >
                         <span className="material-symbols-outlined text-[16px]">close</span>
                       </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Add Item Button */}
              {cat.isExpanded && newItemCategoryId !== cat.id && (
                <button 
                  onClick={() => setNewItemCategoryId(cat.id)}
                  className="flex items-center gap-2 mt-4 text-gray-400 font-semibold text-sm hover:text-gray-900 transition-colors w-fit px-2"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Add item
                </button>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
