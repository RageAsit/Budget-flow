import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider,
  signInWithRedirect, 
  getRedirectResult, // <--- NEW IMPORT
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp,
} from 'firebase/firestore';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Trash2, 
  PieChart, 
  List, 
  IndianRupee,
  Monitor,
  Banknote,
  Landmark,
  Calendar,
  Sparkles,
  BrainCircuit,
  X,
  LogOut,
  User
} from 'lucide-react';

// --- 1. YOUR SPECIFIC KEYS (PRE-FILLED) ---
const firebaseConfig = {
  apiKey: "AIzaSyCGpFx0dHogy6QppuIm8eO4T5lAmBZtOZc",
  authDomain: "budgetflow-c179c.firebaseapp.com",
  projectId: "budgetflow-c179c",
  storageBucket: "budgetflow-c179c.firebasestorage.app",
  messagingSenderId: "271934537218",
  appId: "1:271934537218:web:dc0d53d90978acb7f7b11b",
  measurementId: "G-YRE4K43WMJ"
};

const geminiApiKey = "AIzaSyC-XQhe3XV8Qz3lcbu83tjiGF0VUVCRn2A";
const appId = "my-personal-budget"; 

// --- Initialization ---
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Initialization Error:", e);
}

// --- Gemini API Helper ---
const callGeminiAPI = async (prompt, jsonMode = false) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: jsonMode ? { responseMimeType: "application/json" } : undefined
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

// --- Components ---
const SummaryCard = ({ title, amount, type, icon: Icon, subLabel }) => {
  const colorClass = 
    type === 'income' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 
    type === 'expense' ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' : 
    type === 'fd' ? 'text-violet-400 bg-violet-500/10 border border-violet-500/20' :
    'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20';

  return (
    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex items-center space-x-4 hover:border-slate-700 transition-colors shadow-lg shadow-black/20">
      <div className={`p-3 rounded-xl ${colorClass}`}><Icon size={24} /></div>
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{title}</p>
        <h3 className="text-2xl font-bold text-white mt-1">₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
        {subLabel && <p className="text-xs text-slate-500 mt-1">{subLabel}</p>}
      </div>
    </div>
  );
};

const CategoryBar = ({ label, amount, total, color }) => {
  const percentage = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="mb-4 group">
      <div className="flex justify-between text-sm mb-2"><span className="font-medium text-slate-300 group-hover:text-white transition-colors">{label}</span><span className="text-slate-400">₹{amount.toLocaleString('en-IN')}</span></div>
      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden"><div className={`h-full rounded-full ${color} transition-all duration-500 ease-out`} style={{ width: `${percentage}%` }}></div></div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true); // Start loading true!
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  const [amount, setAmount] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Food');
  const [type, setType] = useState('expense');
  const [mode, setMode] = useState('Online');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [smartInput, setSmartInput] = useState('');
  const [isSmartFilling, setIsSmartFilling] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  // AUTH: Listen for user state AND Redirect Results
  useEffect(() => {
    // 1. Check if we are returning from a redirect
    getRedirectResult(auth).then((result) => {
      if (result) {
        console.log("Redirect login success:", result.user);
        setUser(result.user);
      }
    }).catch((error) => {
      console.error("Redirect login error:", error);
      alert("Login Error: " + error.message);
    });

    // 2. Listen for normal auth state changes
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // Only stop loading when Firebase has decided!
    });
    return () => unsubscribeAuth();
  }, []);

  // FIRESTORE: Fetch data
  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
    const unsubscribeDocs = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
         const data = doc.data();
         return {
             id: doc.id,
             ...data,
             createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || new Date())
         };
      });
      docs.sort((a, b) => b.createdAt - a.createdAt);
      setTransactions(docs);
    }, (error) => console.error("Error fetching transactions:", error));
    return () => unsubscribeDocs();
  }, [user]);

  // --- Google Login (REDIRECT METHOD) ---
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true); // Show loading spinner while redirecting
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Login Failed:", error);
      setLoading(false);
      alert(`Login failed: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setTransactions([]); 
  };

  // --- Calculations ---
  const modeBalances = useMemo(() => {
    let cash = 0; let online = 0; let fd = 0; let total = 0;
    transactions.forEach(t => {
      const amt = Number(t.amount);
      if (t.type === 'income') {
        if (t.mode === 'Cash') cash += amt; else if (t.mode === 'Online') online += amt; else if (t.mode === 'FD(Saving)') fd += amt;
        total += amt;
      } else {
        if (t.mode === 'Cash') cash -= amt; else if (t.mode === 'Online') online -= amt; else if (t.mode === 'FD(Saving)') fd -= amt; 
        total -= amt;
      }
    });
    return { cash, online, fd, total };
  }, [transactions]);

  const filteredTransactions = useMemo(() => transactions.filter(t => t.createdAt.toISOString().slice(0, 7) === selectedMonth), [transactions, selectedMonth]);
  const monthlySummary = useMemo(() => {
    const income = filteredTransactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + Number(curr.amount), 0);
    const expense = filteredTransactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + Number(curr.amount), 0);
    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);
  const categoryData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    const cats = {}; expenses.forEach(t => { cats[t.category] = (cats[t.category] || 0) + Number(t.amount); });
    return Object.entries(cats).sort(([,a], [,b]) => b - a).slice(0, 5);
  }, [filteredTransactions]);

  // --- Actions ---
  const generateInsight = async () => {
    if (filteredTransactions.length === 0) { setAiInsight("No transactions found for this month."); return; }
    setIsGeneratingInsight(true);
    try {
      const topCategories = categoryData.map(([cat, amt]) => `${cat}: ₹${amt}`).join(", ");
      const prompt = `Act as a savvy financial coach. Analyze: Income: ₹${monthlySummary.income}, Expense: ₹${monthlySummary.expense}, Balance: ₹${monthlySummary.balance}, Top Categories: ${topCategories}. Provide 3 short, punchy insights using emojis.`;
      const text = await callGeminiAPI(prompt);
      if (text) setAiInsight(text);
    } catch (error) { console.error(error); setAiInsight("AI is taking a break."); }
    setIsGeneratingInsight(false);
  };
  const handleSmartFill = async () => {
    if (!smartInput.trim()) return;
    setIsSmartFilling(true);
    try {
      const prompt = `Extract transaction details from: "${smartInput}". JSON only. Keys: amount(number), subject(string), category(string), type('expense'|'income'), mode('Cash'|'Online'|'FD(Saving)').`;
      const jsonString = await callGeminiAPI(prompt, true);
      if (jsonString) {
        const data = JSON.parse(jsonString);
        if (data) { setAmount(data.amount || ''); setSubject(data.subject || ''); setCategory(data.category || 'Others'); setType(data.type || 'expense'); setMode(data.mode || 'Online'); }
      }
    } catch (error) { console.error(error); alert("Couldn't understand that."); }
    setIsSmartFilling(false);
  };
  const handleAddTransaction = async (e) => {
    e.preventDefault(); if (!amount || !subject || !user) return;
    setIsSubmitting(true);
    try {
      const selectedDate = new Date(entryDate + 'T12:00:00');
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), { amount: parseFloat(amount), description: subject, category, type, mode, createdAt: selectedDate });
      setAmount(''); setSubject(''); setSmartInput(''); setEntryDate(new Date().toISOString().split('T')[0]); setIsSubmitting(false); setActiveTab('dashboard');
    } catch (error) { console.error("Error adding:", error); setIsSubmitting(false); }
  };
  const handleDelete = async (id) => { if (!user) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id)); } catch (error) { console.error("Error deleting:", error); } };

  // --- LOADING VIEW ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
          <p className="text-slate-400 text-sm">Connecting securely...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-sans text-slate-200 selection:bg-cyan-500/30">
        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl w-full max-w-md text-center">
          <div className="bg-cyan-500/10 p-4 rounded-full inline-block mb-6 border border-cyan-500/20">
            <Wallet className="h-12 w-12 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to BudgetFlow</h1>
          <p className="text-slate-400 mb-8">Your AI-powered financial command center.</p>
          
          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200 pb-24 md:pb-0 selection:bg-cyan-500/30">
      <header className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 pt-6 pb-24 px-6 relative z-0">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div>
              <h1 className="text-3xl font-extrabold flex items-center gap-3 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                <Wallet className="h-8 w-8 text-cyan-500" /> BudgetFlow
              </h1>
              <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                <User size={12}/> {user.email}
              </p>
            </div>
            <button onClick={handleLogout} className="md:hidden bg-slate-800 p-2 rounded-full text-slate-400"><LogOut size={18}/></button>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="bg-slate-800 p-1 rounded-xl flex items-center border border-slate-700 shadow-inner">
              <Calendar className="text-slate-400 ml-3" size={18} />
              <input type="month" value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setAiInsight(null); }} className="bg-transparent text-white text-sm font-medium px-3 py-1.5 outline-none border-none cursor-pointer" />
            </div>
            <button onClick={handleLogout} className="hidden md:flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm transition-colors">
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 -mt-20 relative z-10"> 
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <section>
              <div className="bg-gradient-to-br from-violet-900/50 to-fuchsia-900/50 rounded-2xl p-6 border border-white/10 shadow-xl backdrop-blur-sm relative overflow-hidden">
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <h2 className="font-bold text-lg flex items-center gap-2 text-white"><Sparkles className="text-amber-300" size={20} /> AI Assistant</h2>
                  {!aiInsight && <button onClick={generateInsight} disabled={isGeneratingInsight} className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-full transition-all border border-white/10">{isGeneratingInsight ? 'Analyzing...' : 'Analyze Spending'}</button>}
                </div>
                {aiInsight ? <div className="bg-black/20 rounded-xl p-5 text-slate-200 text-sm leading-relaxed whitespace-pre-line border border-white/5 relative z-10">{aiInsight}<button onClick={() => setAiInsight(null)} className="absolute top-2 right-2 text-slate-400 hover:text-white p-1"><X size={16}/></button></div> : <p className="text-slate-300 text-sm relative z-10">Get smart insights about your {new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long' })} finances instantly.</p>}
              </div>
            </section>

            <section>
              <h2 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4 ml-1">Total Net Worth</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <SummaryCard title="Total Balance" amount={modeBalances.total} type="balance" icon={Wallet} subLabel="All Accounts" />
                <SummaryCard title="Online" amount={modeBalances.online} type="balance" icon={Monitor} subLabel="Digital" />
                <SummaryCard title="Cash" amount={modeBalances.cash} type="balance" icon={Banknote} subLabel="Physical" />
                <SummaryCard title="FD (Savings)" amount={modeBalances.fd} type="fd" icon={Landmark} subLabel="Locked" />
              </div>
            </section>

            <section>
              <h2 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4 ml-1">{new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })} Overview</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg flex flex-col justify-center">
                   <div className="flex items-center justify-between mb-8">
                      <div><p className="text-sm text-slate-400 font-medium">Income</p><p className="text-3xl font-bold text-emerald-400 mt-1">+₹{monthlySummary.income.toLocaleString('en-IN')}</p></div>
                      <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20"><TrendingUp size={28} /></div>
                   </div>
                   <div className="h-px w-full mb-8 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                   <div className="flex items-center justify-between">
                      <div><p className="text-sm text-slate-400 font-medium">Expense</p><p className="text-3xl font-bold text-rose-400 mt-1">-₹{monthlySummary.expense.toLocaleString('en-IN')}</p></div>
                      <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20"><TrendingDown size={28} /></div>
                   </div>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
                  <div className="flex items-center gap-2 mb-6"><PieChart size={20} className="text-cyan-400" /><h2 className="text-lg font-bold text-white">Spending Split</h2></div>
                  {categoryData.length > 0 ? (
                    <div className="space-y-5">{categoryData.map(([cat, amt], idx) => (<CategoryBar key={cat} label={cat} amount={amt} total={monthlySummary.expense} color={['bg-gradient-to-r from-blue-500 to-cyan-400', 'bg-gradient-to-r from-violet-500 to-purple-400', 'bg-gradient-to-r from-fuchsia-500 to-pink-400', 'bg-gradient-to-r from-emerald-500 to-teal-400', 'bg-gradient-to-r from-amber-500 to-orange-400'][idx % 5]} />))}</div>
                  ) : (<div className="flex flex-col items-center justify-center h-40 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl"><p>No spending data yet</p></div>)}
                </div>
              </div>
            </section>

            <section>
               <div className="flex justify-between items-center mb-4 ml-1">
                  <h2 className="text-slate-500 text-xs font-bold uppercase tracking-widest">Recent Activity ({filteredTransactions.length})</h2>
                  <button onClick={() => setActiveTab('history')} className="text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors">View All</button>
                </div>
                <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
                  <div className="divide-y divide-slate-800">
                    {filteredTransactions.slice(0, 5).map((t) => (
                      <div key={t.id} className="p-4 hover:bg-slate-800/50 flex items-center justify-between group transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-full ${t.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{t.type === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}</div>
                          <div><p className="font-semibold text-slate-200">{t.description}</p><div className="flex items-center gap-2 text-xs text-slate-500 mt-1"><span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-400">{t.mode}</span><span>•</span><span>{t.category}</span><span>•</span><span>{t.createdAt.toLocaleDateString()}</span></div></div>
                        </div>
                        <span className={`font-bold ${t.type === 'income' ? 'text-emerald-400' : 'text-slate-200'}`}>{t.type === 'income' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                  {filteredTransactions.length === 0 && <div className="py-16 text-center"><div className="inline-block p-4 rounded-full bg-slate-800/50 mb-3"><List size={32} className="text-slate-600" /></div><p className="text-slate-500">No transactions found for {selectedMonth}.</p></div>}
                </div>
            </section>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="max-w-lg mx-auto mt-8 space-y-6">
            <div className="bg-slate-900 p-1 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500">
              <div className="bg-slate-950 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><BrainCircuit size={18} className="text-cyan-400" /> AI Smart Fill</h3>
                <div className="flex gap-2">
                  <input type="text" value={smartInput} onChange={(e) => setSmartInput(e.target.value)} placeholder="e.g. Spent 500 on KFC via GPay" className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none text-sm text-white placeholder:text-slate-600 transition-all" />
                  <button onClick={handleSmartFill} disabled={isSmartFilling || !smartInput} className="bg-cyan-500 hover:bg-cyan-600 text-white px-5 py-2 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-cyan-500/20">{isSmartFilling ? <Sparkles className="animate-spin" size={18} /> : <Sparkles size={18} />}<span className="hidden sm:inline">Fill</span></button>
                </div>
              </div>
            </div>
            <div className="bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-white"><div className="bg-cyan-500/10 p-2 rounded-full border border-cyan-500/20 text-cyan-400"><Plus size={20} /></div> Manual Entry</h2>
              <form onSubmit={handleAddTransaction} className="space-y-6">
                {/* DATE PICKER */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Date</label>
                  <input type="date" required value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none text-white transition-all [color-scheme:dark]" />
                </div>
                
                <div className="grid grid-cols-2 gap-4 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button type="button" onClick={() => { setType('expense'); setMode('Online'); }} className={`p-3 rounded-lg text-center font-medium transition-all ${type === 'expense' ? 'bg-slate-800 text-rose-400 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>Debit</button>
                  <button type="button" onClick={() => { setType('income'); setMode('Online'); }} className={`p-3 rounded-lg text-center font-medium transition-all ${type === 'income' ? 'bg-slate-800 text-emerald-400 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>Credit</button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Amount</label>
                  <div className="relative"><IndianRupee className="absolute left-4 top-3.5 text-slate-500" size={18} /><input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none text-white text-lg transition-all placeholder:text-slate-700" placeholder="0.00" /></div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Subject</label>
                  <input type="text" required value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none text-white transition-all placeholder:text-slate-700" placeholder="What is this for?" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Mode</label>
                    <div className="relative">
                      <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none text-white appearance-none cursor-pointer">
                        {type === 'expense' ? (<><option value="Online">Online</option><option value="Cash">Cash</option></>) : (<><option value="Online">Online</option><option value="Cash">Cash</option><option value="FD(Saving)">FD (Saving)</option></>)}
                      </select>
                      <div className="absolute right-4 top-4 pointer-events-none text-slate-500"><Monitor size={16} /></div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Category</label>
                    <div className="relative">
                      <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none text-white appearance-none cursor-pointer">
                        {type === 'expense' ? (<><option>Food</option><option>Transport</option><option>Shopping</option><option>Utilities</option><option>Entertainment</option><option>Health</option><option>Others</option></>) : (<><option>Salary</option><option>Freelance</option><option>Investment</option><option>Gift</option><option>Others</option></>)}
                      </select>
                      <div className="absolute right-4 top-4 pointer-events-none text-slate-500"><List size={16} /></div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 mt-8 pt-4 border-t border-slate-800">
                  <button type="button" onClick={() => setActiveTab('dashboard')} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3.5 rounded-xl transition-colors">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-[2] bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-cyan-500/20 flex justify-center items-center gap-2">{isSubmitting ? 'Saving...' : 'Save Entry'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* History View */}
        {activeTab === 'history' && (
           <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden mt-8 shadow-xl">
             <div className="p-6 border-b border-slate-800 flex justify-between items-center"><h2 className="text-xl font-bold text-white">{new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })} History</h2><button onClick={() => setActiveTab('dashboard')} className="text-sm text-cyan-400 hover:text-cyan-300">Back</button></div>
             <div className="divide-y divide-slate-800">
              {filteredTransactions.map((t) => (
                <div key={t.id} className="p-5 hover:bg-slate-800/50 flex items-center justify-between group transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${t.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{t.type === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}</div>
                    <div><p className="font-semibold text-slate-200">{t.description}</p><div className="flex items-center gap-2 text-xs text-slate-500 mt-1"><span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-400">{t.mode}</span><span>•</span><span>{t.category}</span><span>•</span><span>{t.createdAt.toLocaleDateString()} {t.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></div>
                  </div>
                  <div className="flex items-center gap-4"><span className={`font-bold text-lg ${t.type === 'income' ? 'text-emerald-400' : 'text-slate-200'}`}>{t.type === 'income' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}</span><button onClick={() => handleDelete(t.id)} className="p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Delete"><Trash2 size={18} /></button></div>
                </div>
              ))}
              {filteredTransactions.length === 0 && <div className="py-20 text-center text-slate-500">No transactions found.</div>}
             </div>
           </div>
        )}
      </main>
      <button onClick={() => setActiveTab('add')} className="md:hidden fixed bottom-6 right-6 bg-cyan-500 text-white p-4 rounded-full shadow-lg shadow-cyan-500/40 hover:bg-cyan-600 transition-transform hover:scale-105 active:scale-95 z-50"><Plus size={28} /></button>
      <div className="hidden md:block fixed bottom-8 right-8 z-50">
         {activeTab !== 'add' && <button onClick={() => setActiveTab('add')} className="bg-cyan-500 text-white px-6 py-3 rounded-full shadow-lg shadow-cyan-500/30 hover:bg-cyan-600 font-bold flex items-center gap-2 transition-transform hover:scale-105"><Plus size={20} /> Add Entry</button>}
      </div>
    </div>
  );
}