"use client";

import { useEffect, useMemo, useState } from "react";
import { useTripData } from "@/context/TripContext";
import toast from "react-hot-toast";
import { ArrowDownToLine, ArrowUpToLine, BarChart3, Plus, Trash2, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Participant = { id: string; name: string; color: string };
type Split = { participantId: string; amount: number };
type Expense = {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  category: string;
  date: string;
  splits: Split[];
};

const participantColors = ["bg-indigo-500", "bg-rose-500", "bg-emerald-500", "bg-amber-500", "bg-sky-500"];

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatCurrency = (amount: number, currencyCode: string = 'EUR') => {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
};

export default function BudgetPage() {
  const { tripData, setTripData } = useTripData();
  const { user, token } = useAuth();
  const [participants, setParticipants] = useState<any[]>(() =>
    tripData.participants?.length
      ? tripData.participants
      : [
          { id: "you", name: "You", color: participantColors[0] },
          { id: "host", name: tripData.destination ? tripData.destination.slice(0, 1).toUpperCase() : "A", color: participantColors[1] },
        ],
  );
  const [expenses, setExpenses] = useState<Expense[]>(() => tripData.expenses?.length ? tripData.expenses : []);
  const [participantName, setParticipantName] = useState("");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("0");
  const [expenseCategory, setExpenseCategory] = useState("Food");
  const [payerId, setPayerId] = useState("");
  const [splitMode, setSplitMode] = useState<"equal" | "custom" | "ticket">("equal");
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [ticketParticipants, setTicketParticipants] = useState<string[]>([]);

  useEffect(() => {
    setPayerId((current) => current || participants[0]?.id || "");
  }, [participants]);

  useEffect(() => {
    if (isExpenseModalOpen) {
      setTicketParticipants(participants.map(p => p.id));
      const defaultSplits: Record<string, string> = {};
      participants.forEach(p => defaultSplits[p.id] = "0");
      setCustomSplits(defaultSplits);
    }
  }, [participants, isExpenseModalOpen]);

  useEffect(() => {
    setTripData({ participants, expenses });
  }, [expenses, participants, setTripData]);

  const totals = useMemo(() => {
    const paid: Record<string, number> = {};
    const owed: Record<string, number> = {};

    for (const participant of participants) {
      paid[participant.id] = 0;
      owed[participant.id] = 0;
    }

    for (const expense of expenses) {
      paid[expense.payerId] = (paid[expense.payerId] || 0) + expense.amount;
      for (const split of expense.splits) {
        owed[split.participantId] = (owed[split.participantId] || 0) + split.amount;
      }
    }

    const balances = participants.map((participant) => ({
      ...participant,
      paid: paid[participant.id] || 0,
      owed: owed[participant.id] || 0,
      balance: (paid[participant.id] || 0) - (owed[participant.id] || 0),
    }));

    const myParticipant = balances.find((item) => item.id === "you" || (user && item.email && user.email && item.email === user.email));

    return {
      paid,
      owed,
      balances,
      totalSpent: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      youOwe: Math.max(0, -(myParticipant?.balance || 0)),
      youAreOwed: Math.max(0, myParticipant?.balance || 0),
    };
  }, [expenses, participants, user]);

  const settlements = useMemo(() => {
    const creditors = totals.balances.filter((item) => item.balance > 0).sort((left, right) => right.balance - left.balance);
    const debtors = totals.balances.filter((item) => item.balance < 0).sort((left, right) => left.balance - right.balance);
    const moves: { from: string; to: string; amount: number }[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(-debtors[i].balance, creditors[j].balance);
      moves.push({ from: debtors[i].name, to: creditors[j].name, amount });
      debtors[i].balance += amount;
      creditors[j].balance -= amount;
      if (debtors[i].balance >= -0.01) i += 1;
      if (creditors[j].balance <= 0.01) j += 1;
    }

    return moves;
  }, [totals.balances]);

  const categories = useMemo(() => {
    const sums = new Map<string, number>();
    for (const expense of expenses) {
      sums.set(expense.category || "Other", (sums.get(expense.category || "Other") || 0) + expense.amount);
    }
    return [...sums.entries()].sort((left, right) => right[1] - left[1]);
  }, [expenses]);

  const addParticipant = () => {
    const name = participantName.trim();
    if (!name) return;
    
    setParticipants((current) => {
      if (current.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        toast.error(`${name} is already added`);
        return current;
      }
      const id = makeId();
      toast.success(`Added ${name}`);
      return [
        ...current,
        { id, name, color: participantColors[current.length % participantColors.length] },
      ];
    });
    setParticipantName("");
  };

  const removeParticipant = async (participantId: string) => {
    // Determine if it's the current user or owner (don't allow removing owner from here easily, or handle it via API)
    const target = participants.find(p => p.id === participantId);
    if (!target) return;
    
    if (target.role === "owner" || target.id === "you" || (user && target.email === user.email)) {
      toast.error("You cannot remove the trip owner or yourself here.");
      return;
    }

    // If it's a numeric ID (backend member), try to remove via API
    if (!isNaN(Number(participantId)) && tripData?.id) {
      if (!confirm(`Are you sure you want to remove ${target.name} from the trip entirely?`)) return;
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripData.id}/members/${participantId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.detail || "Failed to remove member");
          return; 
        }
      } catch (err) {
        toast.error("Failed to remove member");
        return;
      }
    }
    
    // Remove from local state
    setParticipants(current => current.filter(p => p.id !== participantId));
    
    // Also remove them from any expenses where they are the payer, or splits
    setExpenses(current => current.map(expense => {
      const remainingParticipants = participants.filter(p => p.id !== participantId);
      const newPayerId = expense.payerId === participantId 
        ? (remainingParticipants[0]?.id || "you")
        : expense.payerId;
        
      const newSplits = expense.splits.filter(s => s.participantId !== participantId);
      
      return {
        ...expense,
        payerId: newPayerId,
        splits: newSplits
      };
    }));
    
    toast.success(`${target.name} removed`);
  };

  const addExpense = () => {
    const amount = Number(expenseAmount);
    if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0 || !payerId || participants.length === 0) return;

    let splits: Split[] = [];
    if (splitMode === "equal") {
      const equalShare = amount / participants.length;
      splits = participants.map((p) => ({ participantId: p.id, amount: Number(equalShare.toFixed(2)) }));
    } else if (splitMode === "ticket") {
      if (ticketParticipants.length === 0) {
        toast.error("Select at least one participant for the ticket");
        return;
      }
      const equalShare = amount / ticketParticipants.length;
      splits = participants.map((p) => ({ 
        participantId: p.id, 
        amount: ticketParticipants.includes(p.id) ? Number(equalShare.toFixed(2)) : 0 
      }));
    } else if (splitMode === "custom") {
      const sum = participants.reduce((acc, p) => acc + Number(customSplits[p.id] || 0), 0);
      if (Math.abs(sum - amount) > 0.01) {
        toast.error(`Custom splits must sum to ${amount} (currently ${sum.toFixed(2)})`);
        return;
      }
      splits = participants.map((p) => ({ participantId: p.id, amount: Number(Number(customSplits[p.id] || 0).toFixed(2)) }));
    }

    setExpenses((current) => [
      {
        id: makeId(),
        title: expenseTitle.trim(),
        amount,
        payerId,
        category: expenseCategory,
        date: new Date().toISOString(),
        splits,
      },
      ...current,
    ]);

    setExpenseTitle("");
    setExpenseAmount("0");
    setIsExpenseModalOpen(false);
    toast.success("Expense added");
  };

  const removeExpense = (expenseId: string) => {
    setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8 animate-fade-in pt-26 px-8 pb-12 bg-[#F7F5F1] text-[#101828]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-on-surface">Costs</h2>
          <p className="text-on-surface-variant text-sm mt-1">Split trip expenses across everyone on the trip.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <Users size={18} className="text-primary" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-black">People</p>
              <p className="text-sm font-bold text-on-surface">{participants.length}</p>
            </div>
          </div>
          <button onClick={() => setIsExpenseModalOpen(true)} className="px-5 py-3 rounded-full bg-[#101828] text-white text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-[#1B2433] transition-colors">
            <Plus size={16} /> Add expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[28px] border border-[#E7E2DB] shadow-[0_8px_24px_rgba(16,24,40,0.04)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center"><ArrowDownToLine size={18} /></div>
            <div>
              <p className="text-sm font-bold text-gray-900">You owe</p>
              <p className="text-xs text-gray-500">Money leaving your pocket</p>
            </div>
          </div>
          <p className="text-4xl font-black text-rose-600">{formatCurrency(totals.youOwe)}</p>
        </div>
        <div className="bg-white p-6 rounded-[28px] border border-[#E7E2DB] shadow-[0_8px_24px_rgba(16,24,40,0.04)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center"><ArrowUpToLine size={18} /></div>
            <div>
              <p className="text-sm font-bold text-gray-900">You’re owed</p>
              <p className="text-xs text-gray-500">Money coming back to you</p>
            </div>
          </div>
          <p className="text-4xl font-black text-emerald-500">{formatCurrency(totals.youAreOwed)}</p>
        </div>
        <div className="bg-[#101828] p-6 rounded-[28px] shadow-[0_16px_32px_rgba(16,24,40,0.16)] text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><BarChart3 size={18} /></div>
            <div>
              <p className="text-sm font-bold">Total trip spend</p>
              <p className="text-xs text-gray-400">All expenses combined</p>
            </div>
          </div>
          <p className="text-4xl font-black">{formatCurrency(totals.totalSpent)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr_320px] gap-6 items-start">
        <section className="bg-white rounded-[28px] border border-[#E7E2DB] shadow-[0_8px_24px_rgba(16,24,40,0.04)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-gray-900">People</h3>
            <button onClick={addParticipant} className="text-xs font-black text-[#E67E22] hover:underline">Add</button>
          </div>
          <div className="flex gap-2">
            <input value={participantName} onChange={(e) => setParticipantName(e.target.value)} placeholder="Name" className="flex-1 rounded-full border border-[#E7E2DB] bg-[#FCFBF9] px-4 py-2.5 text-sm outline-none focus:border-[#E67E22]" />
            <button onClick={addParticipant} className="px-4 py-2.5 rounded-full bg-[#101828] text-white text-sm font-bold shadow-sm">+</button>
          </div>
          <div className="space-y-2">
            {participants.map((participant) => {
              const balance = totals.balances.find((item) => item.id === participant.id)?.balance || 0;
              return (
                <div key={participant.id} className="flex items-center justify-between rounded-[24px] border border-[#EDE7DF] bg-[#FCFBF9] px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${participant.color} text-white flex items-center justify-center text-xs font-bold`}>{participant.name.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{participant.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {participant.id === "you" || (user && participant.email && user.email && participant.email === user.email) 
                          ? "You" 
                          : participant.role === "owner" 
                            ? "Trip owner" 
                            : "Trip member"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${balance < 0 ? "text-red-500" : balance > 0 ? "text-emerald-500" : "text-gray-500"}`}>
                      {balance < 0 ? "-" : balance > 0 ? "+" : ""}{formatCurrency(Math.abs(balance))}
                    </span>
                    {participant.id !== "you" && !(user && participant.email === user.email) && participant.role !== "owner" && (
                      <button 
                        onClick={() => removeParticipant(participant.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        title="Remove person"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-5">
          <div className="bg-white rounded-[28px] border border-[#E7E2DB] shadow-[0_8px_24px_rgba(16,24,40,0.04)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900">Expenses</h3>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{expenses.length} items</p>
            </div>
            <div className="space-y-3">
              {expenses.length === 0 ? (
                <p className="text-sm text-gray-500">Add the first trip expense to start splitting costs.</p>
              ) : (
                expenses.map((expense) => {
                  const payer = participants.find((participant) => participant.id === expense.payerId)?.name || "Someone";
                  return (
                    <div key={expense.id} className="flex items-center justify-between rounded-[24px] border border-[#EDE7DF] bg-[#FCFBF9] px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{expense.title}</p>
                        <p className="text-[11px] text-gray-500">{expense.category} • paid by {payer}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-gray-900">{formatCurrency(expense.amount)}</span>
                        <button onClick={() => removeExpense(expense.id)} className="w-7 h-7 rounded-full bg-white border border-[#EDE7DF] text-gray-400 flex items-center justify-center hover:text-rose-500 hover:border-rose-200"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="bg-white rounded-[28px] border border-[#E7E2DB] shadow-[0_8px_24px_rgba(16,24,40,0.04)] p-5">
            <h3 className="font-black text-gray-900 mb-4">Settle up</h3>
            <div className="space-y-3">
              {settlements.length === 0 ? (
                <p className="text-sm text-gray-500">No settlement needed yet.</p>
              ) : (
                settlements.map((move, index) => (
                  <div key={index} className="rounded-[24px] bg-[#FCFBF9] border border-[#EDE7DF] px-3 py-2 text-sm font-medium text-gray-700">
                    {move.from} pays {move.to} {formatCurrency(move.amount)}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-[28px] border border-[#E7E2DB] shadow-[0_8px_24px_rgba(16,24,40,0.04)] p-5">
            <h3 className="font-black text-gray-900 mb-4">Balances</h3>
            <div className="space-y-3">
              {totals.balances.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{participant.name}</span>
                  <span className={`font-bold ${participant.balance < 0 ? "text-red-500" : participant.balance > 0 ? "text-emerald-500" : "text-gray-500"}`}>
                    {participant.balance < 0 ? "-" : participant.balance > 0 ? "+" : ""}{formatCurrency(Math.abs(participant.balance))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[28px] border border-[#E7E2DB] shadow-[0_8px_24px_rgba(16,24,40,0.04)] p-5">
            <h3 className="font-black text-gray-900 mb-4">By category</h3>
            <div className="space-y-3">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-500">Categories will appear after you add expenses.</p>
              ) : (
                categories.map(([category, total], index) => (
                  <div key={category}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-gray-700">{category}</span>
                      <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#F1ECE5] overflow-hidden">
                      <div className={`h-full rounded-full ${participantColors[index % participantColors.length]}`} style={{ width: `${Math.max(12, (total / Math.max(totals.totalSpent, 1)) * 100)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {isExpenseModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 py-8 backdrop-blur-[2px]">
          <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-[#E7E2DB] bg-white shadow-[0_24px_80px_rgba(16,24,40,0.22)]">
            <div className="flex items-center justify-between border-b border-[#EEE7DE] px-6 py-5">
              <h3 className="text-2xl font-black text-gray-900">Add expense</h3>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F7F5F1] text-gray-500 transition-colors hover:text-gray-900"
                aria-label="Close add expense form"
              >
                <span className="text-2xl leading-none">×</span>
              </button>
            </div>
            <div className="max-h-[calc(100vh-120px)] overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">What was it for?</span>
                  <input
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    placeholder="e.g. Dinner, souvenirs, gas..."
                    className="w-full rounded-[24px] border border-[#E7E2DB] bg-[#FCFBF9] px-4 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#101828]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">Total amount</span>
                  <input
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="€ 0.00"
                    className="w-full rounded-[24px] border border-[#E7E2DB] bg-[#FCFBF9] px-4 py-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#101828]"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">Currency</span>
                    <select
                      defaultValue="EUR"
                      className="w-full rounded-[24px] border border-[#E7E2DB] bg-[#FCFBF9] px-4 py-3 text-sm font-semibold outline-none focus:border-[#101828]"
                    >
                      <option value="EUR">EUR €</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">Day</span>
                    <input
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="w-full rounded-[24px] border border-[#E7E2DB] bg-[#FCFBF9] px-4 py-3 text-sm outline-none focus:border-[#101828]"
                    />
                  </label>
                </div>

                <div>
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">Category</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Accommodation",
                      "Food & drink",
                      "Groceries",
                      "Transport",
                      "Flights",
                      "Activities",
                      "Sightseeing",
                      "Shopping",
                      "Fees & tickets",
                      "Health",
                      "Tips",
                      "Other",
                    ].map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setExpenseCategory(category)}
                        className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${expenseCategory === category ? "border-[#101828] bg-[#101828] text-white" : "border-[#E7E2DB] bg-[#FCFBF9] text-gray-600 hover:border-[#CFC6BB]"}`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">Who paid?</span>
                  <select
                    value={payerId}
                    onChange={(e) => setPayerId(e.target.value)}
                    className="w-full rounded-[24px] border border-[#E7E2DB] bg-[#FCFBF9] px-4 py-3 text-sm font-semibold outline-none focus:border-[#101828]"
                  >
                    {participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>{participant.name}</option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">Split</span>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setSplitMode("equal")} className={`rounded-full border px-4 py-2 text-sm font-semibold ${splitMode === "equal" ? "border-[#101828] bg-[#101828] text-white" : "border-[#E7E2DB] bg-[#FCFBF9] text-gray-600"}`}>Equally</button>
                    <button onClick={() => setSplitMode("custom")} className={`rounded-full border px-4 py-2 text-sm font-semibold ${splitMode === "custom" ? "border-[#101828] bg-[#101828] text-white" : "border-[#E7E2DB] bg-[#FCFBF9] text-gray-600"}`}>Custom</button>
                    <button onClick={() => setSplitMode("ticket")} className={`rounded-full border px-4 py-2 text-sm font-semibold ${splitMode === "ticket" ? "border-[#101828] bg-[#101828] text-white" : "border-[#E7E2DB] bg-[#FCFBF9] text-gray-600"}`}>Ticket</button>
                  </div>
                </div>

                <div className="rounded-3xl border border-[#E7E2DB] bg-[#FCFBF9] p-4">
                  <div className="space-y-3">
                    {participants.map((participant) => (
                      <div key={participant.id} className="flex items-center justify-between rounded-[24px] border border-[#EDE7DF] bg-white px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${participant.color} text-white flex items-center justify-center text-xs font-bold`}>{participant.name.slice(0, 1).toUpperCase()}</div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{participant.name}</p>
                            <p className="text-[11px] text-gray-500">{participant.id === payerId ? "Payer" : "Trip member"}</p>
                          </div>
                        </div>
                        {splitMode === "equal" && (
                          <span className="text-sm font-black text-gray-900">
                            {formatCurrency(Number(expenseAmount) / participants.length || 0)}
                          </span>
                        )}

                        {splitMode === "ticket" && (
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black text-gray-900">
                              {ticketParticipants.includes(participant.id) ? formatCurrency(Number(expenseAmount) / ticketParticipants.length || 0) : formatCurrency(0)}
                            </span>
                            <input 
                              type="checkbox" 
                              checked={ticketParticipants.includes(participant.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTicketParticipants(prev => [...prev, participant.id]);
                                } else {
                                  setTicketParticipants(prev => prev.filter(id => id !== participant.id));
                                }
                              }}
                              className="w-5 h-5 rounded border-gray-300 text-[#101828] focus:ring-[#101828]"
                            />
                          </div>
                        )}

                        {splitMode === "custom" && (
                          <div className="flex items-center gap-1">
                            <input 
                              type="number"
                              min="0"
                              step="0.01"
                              value={customSplits[participant.id] || ""}
                              onChange={(e) => setCustomSplits(prev => ({ ...prev, [participant.id]: e.target.value }))}
                              className="w-20 rounded-lg border border-[#E7E2DB] bg-[#FCFBF9] px-2 py-1 text-sm font-bold text-right outline-none focus:border-[#101828]"
                              placeholder="0.00"
                            />
                            <span className="text-sm font-black text-gray-900">€</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setIsExpenseModalOpen(false)} className="rounded-full border border-[#E7E2DB] bg-white px-5 py-3 text-sm font-bold text-gray-600">
                    Cancel
                  </button>
                  <button onClick={addExpense} className="rounded-full bg-[#101828] px-5 py-3 text-sm font-bold text-white shadow-sm">
                    Add expense
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}