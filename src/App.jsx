import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Users, PlusCircle, History, ChevronRight, CheckCircle2,
  TrendingUp, TrendingDown, Calendar, LogOut, DollarSign,
  Settings, ArrowLeft, Trash2, UserPlus, Plus, Layout,
  Briefcase, ListChecks, Edit3, Search, ShieldCheck, Lock,
  KeyRound, Loader2, BookOpen, Map, UserCheck, Type, Bell,
  Activity, CheckSquare, Square, Mic2, Info, Clock, Tablet,
  UserCog, Mail, Phone,
} from "lucide-react";

import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  getDoc, getDocs, onSnapshot, serverTimestamp, writeBatch, query, where,
} from "firebase/firestore";

// ─── helpers ──────────────────────────────────────────────────────────────────
const ATTENDANCE_BASE_URL =
  "https://script.google.com/macros/s/AKfycbyIMGZVxCc6xeRpypps_P6XMNFu9UljMGR2Ekjo0v9D2PSSmQB4oXtKmV4ZG-lgFKoibw/exec";

const getTodayStr = () => new Date().toISOString().split("T")[0];
const getYesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
};

function openAttendance(cls, actingTeacher) {
  const params = new URLSearchParams();
  params.set("turma", cls?.name || "");
  params.set("classId", cls?.id || "");
  params.set("className", cls?.name || "");
  params.set("teacherId", actingTeacher?.id || "");
  const url = `${ATTENDANCE_BASE_URL}?${params.toString()}`;
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) window.location.href = url;
}

// ─── Seed Firestore once if empty ─────────────────────────────────────────────
async function seedFirestoreIfEmpty() {
  const snap = await getDocs(collection(db, "teachers"));
  if (!snap.empty) return;

  const batch = writeBatch(db);

  const tAmelia = doc(collection(db, "teachers"));
  const tEdgar  = doc(collection(db, "teachers"));
  const tNancy  = doc(collection(db, "teachers"));
  batch.set(tNancy,  { name: "Nancy",  rate: 0,    active: true });
  batch.set(tAmelia, { name: "Amélia", rate: 2000, active: true });
  batch.set(tEdgar,  { name: "Edgar",  rate: 2000, active: true });

  const planRef = doc(collection(db, "lessonPlans"));
  batch.set(planRef, {
    name: "DM Book 2 (Demo)",
    blocks: [
      { type: "GR", startPage: 1, endPage: 20, expectedLessons: 6 },
      { type: "WB", startPage: 21, endPage: 40, expectedLessons: 6 },
    ],
    active: true,
  });

  const cls1 = doc(collection(db, "classes"));
  const cls2 = doc(collection(db, "classes"));
  batch.set(cls1, { name: "DM2 • 08:00", room: "Sala 1", teacherId: tAmelia.id, lessonPlanId: planRef.id, active: true });
  batch.set(cls2, { name: "DM2 • 10:00", room: "Sala 2", teacherId: tEdgar.id,  lessonPlanId: planRef.id, active: true });

  batch.set(doc(collection(db, "logs")), {
    date: getYesterdayStr(), classId: cls1.id, className: "DM2 • 08:00",
    teacherId: tAmelia.id, teacherName: "Amélia", type: "GR",
    startPage: "1", endPage: "4", lastWord: "Apple",
    dictation: true, isCustomType: false, notes: "Demo",
  });

  batch.set(doc(db, "settings", "main"), { adminPin: "200503", tabletMode: false });

  await batch.commit();
}

// ─── Progress calculation (unchanged logic) ───────────────────────────────────
const calculateProgress = (classId, logs, lessonPlans, classObj) => {
  if (!classObj || !lessonPlans?.length)
    return { lastEndPage: 0, status: "ON TRACK", statusLabel: "A CARREGAR...",
      colorClass: "text-slate-500 bg-slate-100 border-slate-200",
      activeBlock: null, progressNote: "", dictationCount: 0, lastWord: "", lastLog: null };

  const plan = lessonPlans.find((p) => p.id === classObj.lessonPlanId);
  const classLogs = (logs || [])
    .filter((l) => l.classId === classId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const lastLog = classLogs[classLogs.length - 1] || null;
  const lastEndPage = lastLog ? parseInt(lastLog.endPage || 0, 10) : 0;
  const dictationCount = classLogs.filter((l) => !!l.dictation).length;

  if (!plan?.blocks?.length)
    return { lastEndPage, status: "ON TRACK", statusLabel: "SEM PLANO",
      colorClass: "text-slate-500 bg-slate-100 border-slate-200",
      activeBlock: null, progressNote: "", dictationCount,
      lastWord: lastLog?.lastWord || "", lastLog };

  let activeBlock = plan.blocks.find((b) => {
    const s = parseInt(b.startPage || 0, 10);
    const e = parseInt(b.endPage || 0, 10);
    return lastEndPage >= s && lastEndPage < e;
  });
  if (!activeBlock) {
    const lastBlock = plan.blocks[plan.blocks.length - 1];
    activeBlock = lastEndPage >= parseInt(lastBlock.endPage || 0, 10) ? lastBlock : plan.blocks[0];
  }

  const blockStart = parseInt(activeBlock.startPage || 0, 10) || 0;
  const blockEnd   = parseInt(activeBlock.endPage   || 0, 10) || 0;
  const expectedLessonsForBlock = parseInt(activeBlock.expectedLessons || 0, 10) || 1;

  const lessonsInCurrentBlock = classLogs.filter((l) => {
    const ep = parseInt(l.endPage || 0, 10) || 0;
    return ep >= blockStart && ep <= blockEnd;
  }).length;

  const pagesInBlock  = Math.max(0, blockEnd - blockStart);
  const pagesPerLesson = pagesInBlock / expectedLessonsForBlock || 0;
  const actualPagesDone = Math.max(0, lastEndPage - blockStart);
  const daysValueForPagesDone = pagesPerLesson > 0 ? actualPagesDone / pagesPerLesson : 0;
  const lessonDelta = daysValueForPagesDone - lessonsInCurrentBlock;

  let status = "ON TRACK", statusLabel = "EM DIA",
    colorClass = "text-green-600 bg-green-50 border-green-100";

  if (lastLog?.isCustomType) {
    status = "BEHIND"; statusLabel = "ATRASADO (AULA EXTRA)";
    colorClass = "text-red-600 bg-red-50 border-red-100";
  } else if (lessonDelta <= -1) {
    status = "BEHIND"; statusLabel = "ATRASADO";
    colorClass = "text-red-600 bg-red-50 border-red-100";
  } else if (lessonDelta >= 1.5) {
    status = "AHEAD"; statusLabel = "ADIANTADO";
    colorClass = "text-blue-600 bg-blue-50 border-blue-100";
  }

  const pagesLeft   = Math.max(0, blockEnd - lastEndPage);
  const lessonsLeft = Math.max(0, expectedLessonsForBlock - lessonsInCurrentBlock);
  let progressNote = "";
  if (pagesLeft === 0) progressNote = "Fase concluída! Siga para o próximo bloco.";
  else if (lessonsLeft > 0) progressNote = `Faltam ${pagesLeft} páginas para terminar em ${lessonsLeft} aulas`;
  else progressNote = `Atraso: faltam ${pagesLeft} páginas (aulas planeadas já usadas)`;

  return { lastEndPage, status, statusLabel, colorClass, activeBlock,
    progressNote, dictationCount, lastWord: lastLog?.lastWord || "", lastLog };
};

// ═══════════════════════════════════════════════════════════════════════════════
// UI COMPONENTS — identical to original
// ═══════════════════════════════════════════════════════════════════════════════

const Badge = ({ status, label, colorClass }) => (
  <div className={`px-2 py-1 rounded-full text-[9px] font-black flex items-center gap-1 ${colorClass} uppercase border`}>
    {status === "BEHIND"   && <TrendingDown size={10} />}
    {status === "AHEAD"    && <TrendingUp   size={10} />}
    {status === "ON TRACK" && <CheckCircle2 size={10} />}
    {label}
  </div>
);

const TeacherHome = ({
  actingTeacher, tabletMode, classes, logs, lessonPlans,
  setView, setSelectedClass, setOriginView,
  onSwitchTeacher, onOpenAdmin, onExit, canOpenAdmin,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const myClasses = useMemo(() => {
    if (!actingTeacher) return [];
    const st = searchTerm.toLowerCase();
    return classes
      .filter((c) => c.teacherId === actingTeacher.id)
      .filter((c) => c.name.toLowerCase().includes(st));
  }, [classes, actingTeacher, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 animate-in fade-in duration-300">
      <header className="bg-white px-6 py-8 rounded-b-[40px] shadow-sm mb-6 border-b text-left">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-none">
              Olá, {actingTeacher?.name?.split(" ")[0]}!
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-slate-500 font-medium uppercase tracking-widest text-[10px]">
                Nancy Escola • Canvas
              </span>
              {tabletMode && (
                <span className="px-2 py-1 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 uppercase flex items-center gap-1">
                  <Tablet size={12} /> Tablet
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onSwitchTeacher} className="p-2 bg-slate-100 rounded-full active:scale-90 transition-all shadow-sm" title="Trocar Professor">
              <Users size={20} />
            </button>
            {canOpenAdmin && (
              <button onClick={onOpenAdmin} className="p-2 bg-slate-900 text-white rounded-full active:scale-90 transition-all shadow-sm" title="Direção">
                <ShieldCheck size={20} />
              </button>
            )}
            <button onClick={onExit} className="p-2 bg-slate-100 rounded-full active:scale-90 transition-all shadow-sm" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-12 pr-4 text-sm font-bold outline-none"
            placeholder="Procurar minha turma..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      <main className="px-6 space-y-6 text-left">
        {myClasses.map((cls) => {
          const prog = calculateProgress(cls.id, logs, lessonPlans, cls);
          const alreadyLoggedToday = logs.some((l) => l.classId === cls.id && l.date === getTodayStr());
          return (
            <div key={cls.id} className="bg-white rounded-[32px] p-5 shadow-sm border border-slate-100 text-left">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 tracking-tight leading-none">{cls.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                    Plano: {lessonPlans.find((p) => p.id === cls.lessonPlanId)?.name || "N/D"}
                  </p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Badge status={prog.status} label={prog.statusLabel} colorClass={prog.colorClass} />
                  {prog.activeBlock && (
                    <div className="px-2 py-1 rounded-full text-[9px] font-black bg-slate-100 text-slate-500 uppercase border border-slate-200 flex items-center gap-1">
                      <Map size={10} /> {prog.activeBlock.type}
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 my-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={14} className="text-indigo-500" />
                  <p className="text-[11px] font-black text-slate-700 uppercase tracking-tight">{prog.progressNote}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center bg-white p-2 rounded-xl border">
                    <p className="text-[8px] uppercase font-bold text-slate-400">Pág. Atual</p>
                    <p className="text-lg font-black text-slate-800">{prog.lastEndPage}</p>
                  </div>
                  <div className="text-center bg-white p-2 rounded-xl border">
                    <p className="text-[8px] uppercase font-bold text-slate-400">Dictations</p>
                    <p className="text-lg font-black text-amber-600">{prog.dictationCount}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={alreadyLoggedToday}
                  onClick={() => { setSelectedClass(cls); setOriginView("teacher_home"); setView("log_lesson"); }}
                  className={`flex-[2.5] py-4 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 transition-all ${
                    alreadyLoggedToday ? "bg-slate-100 text-slate-400" : "bg-indigo-600 text-white shadow-lg active:scale-95"
                  }`}
                >
                  {alreadyLoggedToday ? <CheckCircle2 size={18} /> : <PlusCircle size={18} />}
                  {alreadyLoggedToday ? "Registrada" : "Registar"}
                </button>
                <button onClick={() => openAttendance(cls, actingTeacher)}
                  className="flex-1 bg-emerald-50 text-emerald-700 rounded-2xl flex justify-center items-center border border-emerald-100 active:scale-95 font-black text-[10px] uppercase">
                  Attendance
                </button>
                <button onClick={() => { setSelectedClass(cls); setOriginView("teacher_home"); setView("class_plan_view"); }}
                  className="flex-1 bg-amber-50 text-amber-600 rounded-2xl flex justify-center items-center border border-amber-100 active:scale-95" title="Plano">
                  <ListChecks size={20} />
                </button>
                <button onClick={() => { setSelectedClass(cls); setOriginView("teacher_home"); setView("class_history"); }}
                  className="flex-1 bg-slate-50 text-slate-400 rounded-2xl border flex justify-center items-center active:scale-95" title="Histórico">
                  <History size={20} />
                </button>
              </div>
            </div>
          );
        })}
        {myClasses.length === 0 && (
          <div className="bg-white rounded-[32px] p-8 border text-center text-slate-500 font-bold">
            Nenhuma turma encontrada.
          </div>
        )}
      </main>
    </div>
  );
};

const ClassHistory = ({ selectedClass, logs, setView, originView }) => (
  <div className="min-h-screen bg-slate-50 pb-10 text-left animate-in slide-in-from-right duration-500">
    <header className="bg-white p-8 border-b flex items-center gap-6 sticky top-0 z-10 shadow-sm rounded-b-[40px]">
      <button onClick={() => setView(originView)} className="p-3 bg-slate-50 rounded-2xl active:scale-90 transition-all hover:bg-slate-100 shadow-sm">
        <ArrowLeft size={22} />
      </button>
      <div className="flex-1">
        <h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none mb-1">{selectedClass.name}</h1>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[2px] leading-none">Histórico de Aulas</p>
      </div>
    </header>
    <div className="p-6 space-y-4">
      {logs
        .filter((l) => l.classId === selectedClass.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((log) => (
          <div key={log.id} className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-indigo-600" />
                <span className="text-[11px] font-black text-indigo-900 uppercase tracking-widest leading-none">{log.date}</span>
              </div>
              <div className="flex gap-2">
                {log.dictation && (
                  <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg shadow-sm" title="Dictation Feito">
                    <Mic2 size={12} />
                  </div>
                )}
                <span className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full text-slate-500 uppercase tracking-tighter leading-none shadow-sm">
                  {log.teacherName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[11px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-xl uppercase border border-indigo-100 leading-none">{log.type}</span>
              <p className="text-lg font-bold text-slate-800 leading-none">Páginas {log.startPage} a {log.endPage}</p>
            </div>
            {log.lastWord && (
              <div className="mt-3 text-[10px] font-black text-slate-400 flex items-center gap-1.5 uppercase tracking-tighter">
                <Type size={12} /> Última: <span className="text-slate-900">{log.lastWord}</span>
              </div>
            )}
            {log.notes && <div className="mt-5 text-sm text-slate-600 leading-relaxed font-medium pl-4 border-l-4 border-indigo-100 italic">{log.notes}</div>}
          </div>
        ))}
    </div>
  </div>
);

const ClassPlanView = ({ selectedClass, lessonPlans, logs, setView, originView }) => {
  const plan = lessonPlans.find((p) => p.id === selectedClass.lessonPlanId);
  const prog = calculateProgress(selectedClass.id, logs, lessonPlans, selectedClass);
  return (
    <div className="min-h-screen bg-slate-50 pb-10 text-left animate-in slide-in-from-bottom duration-500">
      <header className="bg-white p-8 border-b flex items-center gap-6 sticky top-0 z-10 shadow-sm rounded-b-[40px]">
        <button onClick={() => setView(originView)} className="p-3 bg-slate-50 rounded-2xl active:scale-90 transition-all shadow-sm">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none mb-1">Plano Pedagógico</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[2px] leading-none">{plan?.name || "Sem plano"}</p>
        </div>
      </header>
      <div className="p-8 space-y-4">
        {(plan?.blocks || []).map((b, idx) => {
          const isDone = prog.lastEndPage >= parseInt(b.endPage, 10);
          const isActive = prog.activeBlock &&
            prog.activeBlock.startPage === b.startPage &&
            prog.activeBlock.endPage === b.endPage;
          return (
            <div key={idx} className={`p-8 rounded-[40px] border-2 transition-all ${
              isDone    ? "bg-green-50 border-green-100 opacity-60" :
              isActive  ? "bg-white border-indigo-500 shadow-2xl scale-105 ring-4 ring-indigo-50" :
                          "bg-white border-slate-100"}`}>
              <div className="flex justify-between items-center mb-3">
                <span className={`text-[11px] font-black px-4 py-1 rounded-full uppercase leading-none ${isActive ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                  Fase {idx + 1}
                </span>
                {isDone && <CheckCircle2 className="text-green-500" size={24} />}
              </div>
              <h4 className="text-3xl font-black text-slate-800 tracking-tighter mb-1 leading-none">{b.type}</h4>
              <p className="text-base font-bold text-slate-400 leading-none">Intervalo: Páginas {b.startPage} a {b.endPage}</p>
            </div>
          );
        })}
        {!plan && <div className="bg-white border rounded-[32px] p-8 text-center text-slate-600 font-bold">Esta turma ainda não tem plano.</div>}
      </div>
    </div>
  );
};

const LogLesson = ({ selectedClass, teachers, lessonPlans, logs, setView, notify, originView, onCreateLog }) => {
  const prog = calculateProgress(selectedClass.id, logs, lessonPlans, selectedClass);
  const [customTypeMode, setCustomTypeMode] = useState(false);
  const [isDictation,    setIsDictation]    = useState(false);
  const [typeSelect,     setTypeSelect]     = useState(prog.activeBlock?.type || "");
  const [typeCustom,     setTypeCustom]     = useState("");
  const [startPage,      setStartPage]      = useState(String((prog.lastEndPage || 0) + 1));
  const [endPage,        setEndPage]        = useState(String((prog.lastEndPage || 0) + 1));
  const [lastWord,       setLastWord]       = useState("");
  const [notes,          setNotes]          = useState("");
  const [isSub,          setIsSub]          = useState(false);
  const [subTeacherId,   setSubTeacherId]   = useState("");

  const uniqueTypes = useMemo(() => {
    const plan = lessonPlans.find((p) => p.id === selectedClass.lessonPlanId);
    return [...new Set((plan?.blocks || []).map((b) => b.type))].filter(Boolean);
  }, [lessonPlans, selectedClass.lessonPlanId]);

  const alreadyDone = logs.some((l) => l.classId === selectedClass.id && l.date === getTodayStr());

  return (
    <div className="min-h-screen bg-white p-8 text-left animate-in slide-in-from-bottom duration-500">
      <div className="flex items-center gap-6 mb-12">
        <button onClick={() => setView(originView)} className="p-4 bg-slate-50 rounded-2xl active:scale-90 transition-all hover:bg-slate-100 shadow-sm">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-none mb-1">Registar Aula</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[3px] leading-none">{selectedClass.name}</p>
        </div>
      </div>

      <div className="space-y-8 max-w-lg mx-auto">
        {alreadyDone && (
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-3">
            <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-amber-800">Já existe um registo hoje ({getTodayStr()}) para esta turma.</p>
          </div>
        )}

        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest leading-none">Tipo de Aula</label>
          <select className="w-full p-6 bg-slate-50 border-2 rounded-[32px] font-black text-lg outline-none focus:border-indigo-500 transition-all shadow-inner"
            value={customTypeMode ? "OUTRO" : typeSelect}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "OUTRO") setCustomTypeMode(true);
              else { setCustomTypeMode(false); setTypeSelect(v); }
            }}>
            <option value="">Escolher tipo do plano...</option>
            {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="OUTRO">Aula Extra (Consome 1 Dia)</option>
          </select>
          {customTypeMode && (
            <>
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-3">
                <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-amber-700 leading-tight">Aula Extra gasta tempo planeado sem avançar páginas obrigatórias.</p>
              </div>
              <input type="text" placeholder="Qual o tipo de aula extra?"
                className="w-full p-6 bg-white border-2 border-indigo-500 rounded-[32px] font-black text-lg outline-none shadow-lg"
                value={typeCustom} onChange={(e) => setTypeCustom(e.target.value)} />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest leading-none">De (Página)</label>
            <input type="number" className="w-full p-6 bg-slate-50 border-2 rounded-[32px] font-black text-2xl outline-none focus:border-indigo-500 shadow-inner"
              value={startPage} onChange={(e) => setStartPage(e.target.value)} />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest leading-none">Até (Página)</label>
            <input type="number" className="w-full p-6 bg-slate-50 border-2 rounded-[32px] font-black text-2xl outline-none focus:border-indigo-500 shadow-inner"
              value={endPage} onChange={(e) => setEndPage(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest leading-none">Última Palavra Dada</label>
          <div className="relative shadow-inner rounded-[32px]">
            <Type className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
            <input type="text" placeholder="Ex: Page 5, word: 'Apple'"
              className="w-full p-6 pl-16 bg-slate-50 border-2 rounded-[32px] font-black text-lg outline-none focus:border-indigo-500 transition-all"
              value={lastWord} onChange={(e) => setLastWord(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[32px] border-2 border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl"><Mic2 size={24} /></div>
            <div>
              <p className="font-black text-slate-700 leading-none">Ditado (Dictation) realizado?</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Será somado ao contador da turma</p>
            </div>
          </div>
          <button type="button" onClick={() => setIsDictation((p) => !p)}
            className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${isDictation ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-200 border-2 border-slate-100"}`}>
            {isDictation ? <CheckSquare size={28} /> : <Square size={28} />}
          </button>
        </div>

        <div className="bg-slate-50 p-6 rounded-[40px] border-2 border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <UserCheck className="text-indigo-600" size={24} />
              <span className="font-black text-slate-700 text-sm tracking-tight">Substituição?</span>
            </div>
            <input type="checkbox" className="w-7 h-7 accent-indigo-600 rounded-xl cursor-pointer"
              checked={isSub} onChange={(e) => setIsSub(e.target.checked)} />
          </div>
          {isSub && (
            <select className="w-full p-5 mt-4 bg-white border-2 border-indigo-100 rounded-2xl font-black text-sm text-indigo-900 shadow-sm"
              value={subTeacherId} onChange={(e) => setSubTeacherId(e.target.value)}>
              <option value="">Quem substituiu esta aula?</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest leading-none">Notas Adicionais</label>
          <textarea placeholder="Descreva brevemente como correu a aula..."
            className="w-full p-7 bg-slate-50 border-2 border-slate-50 rounded-[40px] outline-none h-48 font-medium leading-relaxed focus:border-indigo-500 focus:bg-white transition-all shadow-inner"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <button disabled={alreadyDone} onClick={async () => {
          const s = String(startPage || "").trim();
          const e = String(endPage   || "").trim();
          const finalType = customTypeMode ? String(typeCustom || "").trim() : String(typeSelect || "").trim();
          if (!s || !e)    return notify("Erro: Preencha as páginas!");
          if (!finalType)  return notify("Erro: Selecione o tipo de aula!");
          if (isSub && !subTeacherId) return notify("Erro: Selecione o substituto!");

          const finalTeacherId  = isSub ? subTeacherId : selectedClass.teacherId;
          const finalTeacherObj = teachers.find((t) => t.id === finalTeacherId);

          await onCreateLog({
            date: getTodayStr(),
            classId: selectedClass.id, className: selectedClass.name,
            teacherId: finalTeacherId,
            teacherName: finalTeacherObj ? finalTeacherObj.name : "N/D",
            type: finalType, startPage: s, endPage: e,
            lastWord: String(lastWord || "").trim(),
            dictation: !!isDictation,
            isCustomType: !!customTypeMode,
            notes: String(notes || "").trim(),
          });
          notify("Gravado!");
          setView("teacher_home");
        }} className={`w-full py-7 rounded-[32px] font-black shadow-2xl active:scale-95 transition-all text-xl uppercase tracking-[4px] border border-slate-700 text-center ${alreadyDone ? "bg-slate-200 text-slate-500" : "bg-slate-900 text-white"}`}>
          Finalizar Aula
        </button>
      </div>
    </div>
  );
};

const AdminDashboard = ({
  teachers, classes, lessonPlans, logs, accounts, tabletMode,
  notify, setView, setSelectedClass, setOriginView,
  adminPin, setAdminPin, setTabletMode,
  onAdd, onUpdate, onRemove,
}) => {
  const [tab, setTab] = useState("classes");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddingCls, setIsAddingCls] = useState(false);
  const [newCls, setNewCls] = useState({ name: "", room: "", lessonPlanId: "", teacherId: "" });
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ name: "", rate: 2000 });
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [activePlan, setActivePlan] = useState({ name: "", blocks: [] });
  const [newPinInput, setNewPinInput] = useState("");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ teacherId: "", name: "", phone: "", email: "", password: "", role: "teacher" });
  const [accountError, setAccountError] = useState("");

  const filteredClasses = useMemo(() => {
    const st = searchTerm.toLowerCase();
    return classes.filter((c) => c.name.toLowerCase().includes(st));
  }, [classes, searchTerm]);

  const missingLogsYesterday = useMemo(() => {
    const yesterday = getYesterdayStr();
    return classes.filter((cls) => !logs.some((l) => l.classId === cls.id && l.date === yesterday));
  }, [classes, logs]);

  const totalPlanLessons = useMemo(
    () => activePlan.blocks?.reduce((acc, b) => acc + (parseInt(b.expectedLessons, 10) || 0), 0) || 0,
    [activePlan.blocks]
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 animate-in fade-in">
      <header className="bg-slate-900 text-white px-6 py-10 rounded-b-[40px] shadow-2xl mb-6 text-left">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tighter">Direção Nancy</h1>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[3px] flex items-center gap-1">
                <Bell size={12} /> Canvas
              </p>
              {tabletMode && (
                <span className="px-2 py-1 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-200 border border-amber-500/20 uppercase flex items-center gap-1">
                  <Tablet size={12} /> Tablet ON
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setView("teacher_home")} className="p-2 bg-slate-800 rounded-full active:scale-90">
            <LogOut size={20} />
          </button>
        </div>

        {missingLogsYesterday.length > 0 && (
          <div className="mb-6 bg-red-950/40 border border-red-500/30 p-5 rounded-[32px]">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center text-white shrink-0"><Bell size={20} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-400 leading-none">Atenção:</p>
                <p className="text-xs font-bold text-white mt-1">Turmas sem registo de ontem ({getYesterdayStr()}):</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {missingLogsYesterday.map((cls) => (
                <span key={cls.id} className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-[10px] font-black text-red-200">{cls.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {[
            { id: "classes",  label: "Turmas",     icon: Layout    },
            { id: "teachers", label: "Staff",      icon: Briefcase },
            { id: "plans",    label: "Planos",     icon: BookOpen  },
            { id: "payroll",  label: "Folha",      icon: DollarSign},
            { id: "accounts", label: "Contas",     icon: UserCog   },
            { id: "settings", label: "PIN/Tablet", icon: KeyRound  },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${tab === t.id ? "bg-white text-slate-900 shadow-xl scale-105" : "bg-slate-800 text-slate-400"}`}>
              <t.icon size={14} /> {t.label.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="px-6 space-y-6">

        {/* ── CLASSES ── */}
        {tab === "classes" && (
          <div className="space-y-4 text-left">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 outline-none shadow-sm font-bold text-sm"
                placeholder="Pesquisar Turma..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <button onClick={() => setIsAddingCls(true)}
              className="w-full p-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-wider shadow-lg active:scale-95 flex items-center justify-center gap-2">
              <Plus size={20} /> Nova Turma
            </button>
            {isAddingCls && (
              <div className="bg-white p-6 rounded-[32px] shadow-2xl space-y-4 text-left border">
                <input placeholder="Nome da Turma" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newCls.name} onChange={(e) => setNewCls({ ...newCls, name: e.target.value })} />
                <input placeholder="Sala" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newCls.room} onChange={(e) => setNewCls({ ...newCls, room: e.target.value })} />
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newCls.teacherId} onChange={(e) => setNewCls({ ...newCls, teacherId: e.target.value })}>
                  <option value="">Docente Titular...</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newCls.lessonPlanId} onChange={(e) => setNewCls({ ...newCls, lessonPlanId: e.target.value })}>
                  <option value="">Plano de Livro...</option>
                  {lessonPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={async () => {
                  if (!newCls.name || !newCls.teacherId) return notify("Erro: Dados em falta!");
                  await onAdd("classes", { ...newCls, active: true });
                  setIsAddingCls(false);
                  setNewCls({ name: "", room: "", lessonPlanId: "", teacherId: "" });
                  notify("Turma criada!");
                }} className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase shadow-lg">
                  Gravar
                </button>
              </div>
            )}
            {filteredClasses.map((cls) => (
              <div key={cls.id} className="bg-white p-5 rounded-[32px] border flex items-center justify-between text-left shadow-sm">
                <div onClick={() => { setSelectedClass(cls); setOriginView("admin_home"); setView("class_history"); }}
                  className="cursor-pointer flex-1">
                  <p className="font-black text-slate-800 text-xl tracking-tighter leading-none">{cls.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                    {teachers.find((t) => t.id === cls.teacherId)?.name || "S/D"} • Sala {cls.room}
                  </p>
                </div>
                <button onClick={() => openAttendance(cls, { id: cls.teacherId })}
                  className="p-2 rounded-xl bg-slate-900 text-white mr-2 active:scale-90">
                  <Users size={18} />
                </button>
                <button onClick={async () => window.confirm("Eliminar?") && (await onRemove("classes", cls.id))}
                  className="text-slate-200 hover:text-red-500 p-2">
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── TEACHERS ── */}
        {tab === "teachers" && (
          <div className="space-y-4 text-left">
            <button onClick={() => setIsAddingTeacher(true)}
              className="w-full p-5 bg-blue-600 text-white rounded-[24px] font-black uppercase shadow-lg flex items-center justify-center gap-2">
              <UserPlus size={20} /> Novo Docente
            </button>
            {isAddingTeacher && (
              <div className="bg-white p-6 rounded-[32px] shadow-2xl space-y-4 border text-left">
                <input placeholder="Nome" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newTeacher.name} onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })} />
                <input placeholder="Taxa AKZ/Hora" type="number" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newTeacher.rate} onChange={(e) => setNewTeacher({ ...newTeacher, rate: parseInt(e.target.value, 10) || 0 })} />
                <button onClick={async () => {
                  if (!newTeacher.name.trim()) return notify("Erro: Nome obrigatório!");
                  await onAdd("teachers", { ...newTeacher, active: true });
                  setIsAddingTeacher(false);
                  setNewTeacher({ name: "", rate: 2000 });
                  notify("Staff atualizado!");
                }} className="w-full p-5 bg-blue-600 text-white rounded-2xl font-black uppercase">
                  Confirmar
                </button>
              </div>
            )}
            <div className="bg-white rounded-[32px] p-4 border divide-y shadow-sm">
              {teachers.map((t) => (
                <div key={t.id} className="py-5 flex flex-col px-4">
                  <div className="flex justify-between items-center w-full">
                    <div>
                      {editingTeacherId === t.id ? (
                        <input className="font-black text-lg border-b-2 border-indigo-500 outline-none"
                          value={t.name} onChange={(e) => onUpdate("teachers", t.id, { name: e.target.value })} />
                      ) : (
                        <p className="font-black text-slate-800 text-lg leading-none">{t.name}</p>
                      )}
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">
                        {Number(t.rate || 0).toLocaleString()} AKZ/Hora
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingTeacherId(editingTeacherId === t.id ? null : t.id)}
                        className={`p-2 rounded-xl transition-all ${editingTeacherId === t.id ? "bg-green-100 text-green-600" : "bg-slate-50 text-slate-400"}`}>
                        {editingTeacherId === t.id ? <CheckCircle2 size={16} /> : <Edit3 size={16} />}
                      </button>
                      <button onClick={async () => window.confirm("Remover?") && (await onRemove("teachers", t.id))}
                        className="text-slate-200 hover:text-red-500">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {editingTeacherId === t.id && (
                    <div className="mt-3 bg-slate-50 p-3 rounded-2xl border">
                      <input type="number" className="w-full bg-transparent border-none font-bold text-indigo-600 text-sm outline-none"
                        value={t.rate} onChange={(e) => onUpdate("teachers", t.id, { rate: parseInt(e.target.value, 10) || 0 })} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PLANS ── */}
        {tab === "plans" && (
          <div className="space-y-4 text-left">
            <button onClick={() => {
              setActivePlan({ name: "", blocks: [{ type: "GR", startPage: 1, endPage: 10, expectedLessons: 4 }] });
              setIsEditingPlan(true);
            }} className="w-full p-5 bg-amber-500 text-white rounded-[24px] font-black uppercase shadow-lg flex items-center justify-center gap-2">
              <Plus size={20} /> Criar Plano Pedagógico
            </button>
            {isEditingPlan && (
              <div className="bg-white p-6 rounded-[32px] shadow-2xl space-y-4 border text-left">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-black text-amber-700 uppercase text-xs">Editor de Livro</h3>
                  <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-full border border-amber-200">
                    <Activity size={12} className="text-amber-600" />
                    <span className="text-[10px] font-black text-amber-700 uppercase">{totalPlanLessons} Aulas Planeadas</span>
                  </div>
                </div>
                <input placeholder="Título do Plano" className="w-full p-4 bg-slate-50 border rounded-2xl font-black"
                  value={activePlan.name} onChange={(e) => setActivePlan({ ...activePlan, name: e.target.value })} />
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                  {activePlan.blocks?.map((b, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-2xl border space-y-3 relative">
                      <button onClick={() => setActivePlan({ ...activePlan, blocks: activePlan.blocks.filter((_, i) => i !== idx) })}
                        className="absolute top-2 right-2 text-red-300"><Trash2 size={14} /></button>
                      <div className="grid grid-cols-2 gap-3">
                        <input className="p-2 border rounded-xl text-xs font-bold" placeholder="Tipo (ex: GR)" value={b.type}
                          onChange={(e) => { const nb = [...activePlan.blocks]; nb[idx].type = e.target.value; setActivePlan({ ...activePlan, blocks: nb }); }} />
                        <input type="number" className="p-2 border rounded-xl text-xs font-black" placeholder="Nº Aulas" value={b.expectedLessons}
                          onChange={(e) => { const nb = [...activePlan.blocks]; nb[idx].expectedLessons = e.target.value; setActivePlan({ ...activePlan, blocks: nb }); }} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" className="p-2 border rounded-xl text-xs font-bold" placeholder="Início (Pág)" value={b.startPage}
                          onChange={(e) => { const nb = [...activePlan.blocks]; nb[idx].startPage = e.target.value; setActivePlan({ ...activePlan, blocks: nb }); }} />
                        <input type="number" className="p-2 border rounded-xl text-xs font-bold" placeholder="Fim (Pág)" value={b.endPage}
                          onChange={(e) => { const nb = [...activePlan.blocks]; nb[idx].endPage = e.target.value; setActivePlan({ ...activePlan, blocks: nb }); }} />
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setActivePlan({ ...activePlan, blocks: [...(activePlan.blocks || []), { type: "GR", startPage: 1, endPage: 10, expectedLessons: 4 }] })}
                    className="w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-[10px] font-black uppercase">
                    Adicionar Fase
                  </button>
                </div>
                <button onClick={async () => {
                  if (!activePlan.name) return notify("Erro: Plano sem título!");
                  await onAdd("lessonPlans", { ...activePlan, active: true });
                  setIsEditingPlan(false);
                  notify("Plano criado!");
                }} className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase shadow-lg">
                  Sincronizar Plano
                </button>
              </div>
            )}
            <div className="space-y-3">
              {lessonPlans.map((p) => (
                <div key={p.id} className="bg-white p-6 rounded-[32px] border flex justify-between items-center shadow-sm">
                  <div>
                    <p className="font-black text-slate-800 text-xl tracking-tighter leading-none">{p.name}</p>
                    <div className="flex gap-1 mt-2">
                      <span className="text-[9px] bg-indigo-50 px-2 py-0.5 rounded-full font-black text-indigo-500 border border-indigo-100 uppercase">
                        {p.blocks?.reduce((a, b) => a + (parseInt(b.expectedLessons, 10) || 0), 0)} Aulas planeadas
                      </span>
                    </div>
                  </div>
                  <button onClick={() => { setActivePlan(p); setIsEditingPlan(true); }}
                    className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl active:scale-90 shadow-sm">
                    <Settings size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PAYROLL ── */}
        {tab === "payroll" && (
          <div className="bg-white rounded-[40px] p-8 shadow-sm border text-left">
            <div className="flex items-center gap-3 mb-8 border-b pb-6">
              <DollarSign className="text-green-600" size={28} />
              <h3 className="font-black text-slate-900 text-2xl tracking-tighter">Folha Mensal</h3>
            </div>
            <div className="space-y-4">
              {teachers.map((t) => {
                const myLogs = logs.filter((l) => l.teacherId === t.id);
                const totalPay = myLogs.length * (t.rate || 0);
                return (
                  <div key={t.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-[28px] border shadow-sm">
                    <div>
                      <p className="font-black text-slate-800 text-lg leading-none">{t.name}</p>
                      <p className="text-xs text-indigo-600 font-bold mt-1 uppercase text-[9px]">{myLogs.length} aulas registradas</p>
                    </div>
                    <p className="font-black text-slate-900 text-xl">{totalPay.toLocaleString()} AKZ</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ACCOUNTS ── */}
        {tab === "accounts" && (
          <div className="space-y-4 text-left">
            <div className="bg-white rounded-[32px] p-5 border shadow-sm">
              <div className="flex items-start gap-3">
                <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-slate-700 leading-relaxed">
                  Contas via <span className="font-black">Firebase Auth</span>. Cada conta está ligada a um professor e tem acesso real à aplicação.
                </p>
              </div>
            </div>
            <button onClick={() => { setIsAddingAccount(true); setAccountError(""); }}
              className="w-full p-5 bg-slate-900 text-white rounded-[24px] font-black uppercase shadow-lg flex items-center justify-center gap-2">
              <UserCog size={18} /> Criar Conta
            </button>
            {isAddingAccount && (
              <div className="bg-white p-6 rounded-[32px] shadow-2xl space-y-4 border">
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <p className="text-[11px] font-bold text-indigo-700 leading-relaxed">
                    Registe o email do professor aqui. Ele próprio cria a senha no separador <span className="font-black">"Criar Conta"</span> do login.
                  </p>
                </div>
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newAccount.teacherId} onChange={(e) => {
                    const tid = e.target.value;
                    const t = teachers.find((x) => x.id === tid);
                    setNewAccount((p) => ({ ...p, teacherId: tid, name: t?.name || p.name }));
                  }}>
                  <option value="">Associar a que professor?</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input placeholder="Telefone (opcional)" className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold"
                    value={newAccount.phone} onChange={(e) => setNewAccount({ ...newAccount, phone: e.target.value })} />
                </div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input placeholder="Email do professor" className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold"
                    value={newAccount.email} onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })} />
                </div>
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newAccount.role} onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value })}>
                  <option value="teacher">Professor</option>
                  <option value="admin">Admin (Direção)</option>
                </select>
                {accountError && <p className="text-red-500 text-sm font-bold">{accountError}</p>}
                <button onClick={async () => {
                  setAccountError("");
                  if (!newAccount.teacherId) return setAccountError("Escolha o professor.");
                  if (!String(newAccount.email || "").includes("@")) return setAccountError("Email inválido.");
                  try {
                    const t = teachers.find((x) => x.id === newAccount.teacherId);
                    await onAdd("accounts", {
                      teacherId: newAccount.teacherId,
                      name: t?.name || "",
                      phone: String(newAccount.phone || "").trim(),
                      email: String(newAccount.email || "").trim().toLowerCase(),
                      role: newAccount.role || "teacher",
                    });
                    setIsAddingAccount(false);
                    setNewAccount({ teacherId: "", name: "", phone: "", email: "", password: "", role: "teacher" });
                    notify("Email registado! O professor pode criar a senha.");
                  } catch (err) {
                    setAccountError(err.message || "Erro.");
                  }
                }} className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase shadow-lg">
                  Registar Email
                </button>
              </div>
            )}
            <div className="bg-white rounded-[32px] p-4 border divide-y shadow-sm">
              {accounts.length === 0 && <div className="p-6 text-sm text-slate-500 font-bold">Nenhuma conta registada ainda.</div>}
              {accounts.map((a) => (
                <div key={a.id} className="py-5 flex items-center justify-between px-4">
                  <div>
                    <p className="font-black text-slate-800 leading-none">{a.name || "(sem nome)"}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">
                      {a.email}{a.role === "admin" ? " • ADMIN" : ""}{a.phone ? ` • ${a.phone}` : ""}
                    </p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${a.activated ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}`}>
                      {a.activated ? "Ativo" : "Aguarda registo"}
                    </span>
                  </div>
                  <button onClick={async () => window.confirm("Remover conta?") && (await onRemove("accounts", a.id))}
                    className="text-slate-200 hover:text-red-500">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <div className="bg-white rounded-[40px] p-10 border text-left space-y-8 shadow-sm">
            <h3 className="font-black text-slate-900 text-2xl tracking-tighter">PIN & Modo Tablet</h3>
            <div className="p-4 bg-indigo-50 rounded-2xl text-[11px] font-bold text-indigo-700 leading-relaxed">
              <div className="flex items-start gap-3">
                <KeyRound size={16} className="mt-0.5" />
                <p>O <span className="font-black">PIN</span> protege o acesso rápido à Direção. Alterações são guardadas em tempo real para todos os dispositivos.</p>
              </div>
            </div>
            <input type="text" maxLength={6}
              className="w-full p-6 bg-slate-50 border rounded-3xl text-center text-4xl font-black tracking-[16px] outline-none border-2 focus:border-indigo-500 transition-all"
              value={newPinInput} onChange={(e) => setNewPinInput(e.target.value)} />
            <button onClick={() => {
              if (newPinInput.length < 4) return notify("Erro: Mínimo 4 dígitos!");
              setAdminPin(newPinInput);
              setNewPinInput("");
              notify("PIN atualizado!");
            }} className="w-full bg-slate-900 text-white py-6 rounded-[28px] font-black uppercase tracking-widest shadow-xl active:scale-95">
              Gravar PIN
            </button>
            <div className="border-t pt-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Tablet className="text-amber-600" size={22} />
                  <div>
                    <p className="font-black text-slate-800">Modo Tablet (kiosk)</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">tablets da escola: trocar professor fácil</p>
                  </div>
                </div>
                <button onClick={() => { setTabletMode(!tabletMode); notify(!tabletMode ? "Modo Tablet: ON" : "Modo Tablet: OFF"); }}
                  className={`w-16 h-10 rounded-2xl border-2 transition-all flex items-center ${tabletMode ? "bg-amber-500/20 border-amber-300 justify-end" : "bg-slate-50 border-slate-200 justify-start"} p-1`}>
                  <div className={`w-8 h-8 rounded-xl ${tabletMode ? "bg-amber-500" : "bg-slate-300"}`} />
                </button>
              </div>
              <div className="mt-4 p-4 bg-slate-50 rounded-2xl border text-[11px] font-bold text-slate-600 leading-relaxed">
                Se estiver ON: não pede login e vai direto escolher professor. Sincroniza entre todos os dispositivos.
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP  —  Firebase-powered data layer
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {

  // ── State ───────────────────────────────────────────────────────────────────
  const [authLoading,   setAuthLoading]   = useState(true);
  const [dataLoading,   setDataLoading]   = useState(true);
  const [view,          setView]          = useState("login");
  const [originView,    setOriginView]    = useState("teacher_home");
  const [teachers,      setTeachers]      = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [lessonPlans,   setLessonPlans]   = useState([]);
  const [logs,          setLogs]          = useState([]);
  const [accounts,      setAccounts]      = useState([]);
  const [adminPin,      setAdminPinState] = useState("200503");
  const [tabletMode,    setTabletModeState] = useState(false);
  const [session,       setSession]       = useState(null);
  const [actingTeacher, setActingTeacher] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loginTab,      setLoginTab]      = useState("login");
  const [loginEmail,    setLoginEmail]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError,    setLoginError]    = useState("");
  const [loginLoading,  setLoginLoading]  = useState(false);
  const [signupEmail,   setSignupEmail]   = useState("");
  const [signupPassword,setSignupPassword]= useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupError,   setSignupError]   = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [notification,  setNotification]  = useState(null);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [isPinModalOpen,setIsPinModalOpen]= useState(false);
  const [pinInput,      setPinInput]      = useState("");

  const notify = useCallback((msg) => {
    setNotification(String(msg));
    setTimeout(() => setNotification(null), 3500);
  }, []);

  // ── Settings: write to Firestore + local state ──────────────────────────────
  const setAdminPin = useCallback(async (pin) => {
    setAdminPinState(pin);
    try { await updateDoc(doc(db, "settings", "main"), { adminPin: pin }); } catch {}
  }, []);

  const setTabletMode = useCallback(async (val) => {
    setTabletModeState(val);
    try { await updateDoc(doc(db, "settings", "main"), { tabletMode: val }); } catch {}
  }, []);

  // ── Firestore real-time listeners ───────────────────────────────────────────
  useEffect(() => {
    let resolved = 0;
    const check = () => { if (++resolved >= 5) setDataLoading(false); };
    const timeout = setTimeout(() => setDataLoading(false), 8000);

    const unsubs = [
      onSnapshot(collection(db, "teachers"),    (s) => { setTeachers(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "classes"),     (s) => { setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "lessonPlans"), (s) => { setLessonPlans(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "logs"),        (s) => { setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "users"),       (s) => { setAccounts(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(doc(db, "settings", "main"),   (s) => {
        if (s.exists()) {
          setAdminPinState(String(s.data().adminPin || "200503"));
          setTabletModeState(!!s.data().tabletMode);
        }
      }),
    ];

    seedFirestoreIfEmpty().catch(console.error);
    return () => { clearTimeout(timeout); unsubs.forEach((u) => u()); };
  }, []);

  // ── Firebase Auth listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let profile = null;
        const byUid = await getDoc(doc(db, "users", firebaseUser.uid));
        if (byUid.exists()) {
          profile = byUid.data();
        } else {
          const q = query(collection(db, "users"), where("email", "==", firebaseUser.email));
          const res = await getDocs(q);
          if (!res.empty) {
            profile = res.docs[0].data();
            await setDoc(doc(db, "users", firebaseUser.uid), { ...profile, activated: true });
            await deleteDoc(res.docs[0].ref);
          }
        }
        if (profile) {
          setSession({ accountId: firebaseUser.uid, teacherId: profile.teacherId, role: profile.role || "teacher" });
        } else {
          await signOut(auth);
          setSession(null);
          notify("Email não registado. Peça ao administrador para o adicionar.");
        }
      } else {
        setSession(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, [notify]);

  // ── Sync actingTeacher from session ────────────────────────────────────────
  useEffect(() => {
    if (!session) { setActingTeacher(null); return; }
    const t = teachers.find((x) => x.id === session.teacherId) || null;
    if (t) setActingTeacher(t);
  }, [session, teachers]);

  // ── Auto-navigate ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || dataLoading) return;
    if (tabletMode && view === "login")                        { setView("choose_teacher"); return; }
    if (!tabletMode && view === "choose_teacher" && !session)  { setView("login"); return; }
    if (session && view === "login")                           { setView("teacher_home"); setOriginView("teacher_home"); }
  }, [authLoading, dataLoading, session, tabletMode, view]);

  // ── CRUD → Firestore ────────────────────────────────────────────────────────
  const onAdd = useCallback(async (col, data) => {
    if (col === "accounts") {
      await addDoc(collection(db, "users"), {
        teacherId: data.teacherId,
        name:      data.name,
        email:     data.email,
        phone:     data.phone || "",
        role:      data.role || "teacher",
        activated: false,
        createdAt: serverTimestamp(),
      });
      return;
    }
    await addDoc(collection(db, col), data);
  }, []);

  const onUpdate = useCallback(async (col, id, patch) => {
    await updateDoc(doc(db, col, id), patch);
  }, []);

  const onRemove = useCallback(async (col, id) => {
    await deleteDoc(doc(db, col === "accounts" ? "users" : col, id));
  }, []);

  const onCreateLog = useCallback(async (log) => {
    await addDoc(collection(db, "logs"), log);
  }, []);

  // ── Login / logout ──────────────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    if (!loginEmail || !loginPassword) { setLoginError("Preencha email e senha."); return; }
    setLoginLoading(true); setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim().toLowerCase(), loginPassword);
      setLoginPassword("");
    } catch {
      setLoginError("Email ou senha incorretos.");
    } finally {
      setLoginLoading(false);
    }
  }, [loginEmail, loginPassword]);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    setActingTeacher(null);
    setSession(null);
    setView("login");
  }, []);

  const handleSignup = useCallback(async () => {
    setSignupError("");
    if (!signupEmail.trim()) return setSignupError("Insira o seu email.");
    if (signupPassword.length < 6) return setSignupError("Senha mínimo 6 caracteres.");
    if (signupPassword !== signupConfirm) return setSignupError("As senhas não coincidem.");
    setSignupLoading(true);
    try {
      const q = query(collection(db, "users"), where("email", "==", signupEmail.trim().toLowerCase()));
      const res = await getDocs(q);
      if (res.empty) {
        setSignupError("Email não encontrado. Peça ao administrador para o registar primeiro.");
        return;
      }
      await createUserWithEmailAndPassword(auth, signupEmail.trim().toLowerCase(), signupPassword);
      setSignupEmail(""); setSignupPassword(""); setSignupConfirm("");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setSignupError("Este email já tem conta. Use o separador Entrar.");
      } else {
        setSignupError(err.message || "Erro ao criar conta.");
      }
    } finally {
      setSignupLoading(false);
    }
  }, [signupEmail, signupPassword, signupConfirm]);

  // ── Toast notification ──────────────────────────────────────────────────────
  const toast = notification ? (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-8 py-5 rounded-full shadow-2xl flex items-center gap-4 border border-slate-700">
      <CheckCircle2 size={20} className="text-indigo-400" />
      <span className="font-black text-sm tracking-tight">{notification}</span>
    </div>
  ) : null;

  // ── PIN Modal ───────────────────────────────────────────────────────────────
  const PinModal = () => {
    if (!isPinModalOpen) return null;
    const tryPin = () => {
      if (pinInput === adminPin) {
        setView("admin_home"); setOriginView("admin_home");
        setIsPinModalOpen(false); setPinInput("");
      } else notify("Erro: PIN Incorreto");
    };
    return (
      <div className="fixed inset-0 z-[150] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6">
        <div className="bg-white w-full max-w-sm rounded-[56px] p-12 shadow-2xl text-center space-y-10 border">
          <Lock size={40} className="mx-auto text-amber-500" />
          <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Acesso Direção</h2>
          <input type="password" autoFocus maxLength={6}
            className="w-full bg-slate-50 p-6 rounded-[28px] text-center text-5xl font-black tracking-[16px] outline-none border-2 focus:border-indigo-500 transition-all shadow-inner"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryPin()} />
          <div className="flex gap-4">
            <button onClick={() => { setIsPinModalOpen(false); setPinInput(""); }}
              className="flex-1 py-5 bg-slate-100 rounded-[24px] font-black uppercase text-[10px] tracking-widest text-slate-500 active:scale-95">
              Sair
            </button>
            <button onClick={tryPin}
              className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95">
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-8">
        <Loader2 size={56} className="animate-spin text-indigo-500" />
        <div className="text-center animate-pulse">
          <p className="font-black text-xs uppercase tracking-[6px] opacity-70">Nancy Escola</p>
          <p className="text-[10px] font-bold text-indigo-400 mt-2 uppercase tracking-widest">A ligar...</p>
        </div>
      </div>
    );
  }

  // ── Login view ──────────────────────────────────────────────────────────────
  if (view === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        {toast}<PinModal />
        <div className="w-full max-w-md">
          <div className="bg-white rounded-[56px] shadow-2xl p-12 border text-center space-y-8">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter leading-none underline decoration-indigo-500 decoration-8 underline-offset-8">
              Portal Staff
            </h1>

            {/* Tabs */}
            <div className="flex bg-slate-100 rounded-2xl p-1">
              <button onClick={() => { setLoginTab("login"); setLoginError(""); }}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${loginTab === "login" ? "bg-white shadow text-slate-900" : "text-slate-400"}`}>
                Entrar
              </button>
              <button onClick={() => { setLoginTab("signup"); setSignupError(""); }}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${loginTab === "signup" ? "bg-white shadow text-slate-900" : "text-slate-400"}`}>
                Criar Conta
              </button>
            </div>

            {loginTab === "login" && (
              <div className="space-y-4 text-left">
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                  <input className="w-full bg-slate-50 p-5 pl-14 rounded-[24px] border-2 border-slate-50 outline-none font-bold"
                    placeholder="Email" value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    autoComplete="email"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                  <input type="password"
                    className="w-full bg-slate-50 p-5 pl-14 rounded-[24px] border-2 border-slate-50 outline-none font-bold"
                    placeholder="Senha" value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
                </div>
                {loginError && <p className="text-red-500 text-sm font-bold text-center">{loginError}</p>}
                <button onClick={handleLogin} disabled={loginLoading}
                  className="w-full p-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-wider shadow-lg active:scale-95 disabled:opacity-60 flex items-center justify-center gap-3">
                  {loginLoading && <Loader2 size={20} className="animate-spin" />}
                  Entrar
                </button>
              </div>
            )}

            {loginTab === "signup" && (
              <div className="space-y-4 text-left">
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <p className="text-[11px] font-bold text-indigo-700 leading-relaxed">
                    O administrador tem de registar o seu email primeiro. Depois crie a sua senha aqui.
                  </p>
                </div>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                  <input className="w-full bg-slate-50 p-5 pl-14 rounded-[24px] border-2 border-slate-50 outline-none font-bold"
                    placeholder="Email" value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    autoComplete="email" />
                </div>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                  <input type="password"
                    className="w-full bg-slate-50 p-5 pl-14 rounded-[24px] border-2 border-slate-50 outline-none font-bold"
                    placeholder="Criar senha" value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                  <input type="password"
                    className="w-full bg-slate-50 p-5 pl-14 rounded-[24px] border-2 border-slate-50 outline-none font-bold"
                    placeholder="Confirmar senha" value={signupConfirm}
                    onChange={(e) => setSignupConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSignup()} />
                </div>
                {signupError && <p className="text-red-500 text-sm font-bold text-center">{signupError}</p>}
                <button onClick={handleSignup} disabled={signupLoading}
                  className="w-full p-6 bg-indigo-600 text-white rounded-[28px] font-black uppercase tracking-wider shadow-lg active:scale-95 disabled:opacity-60 flex items-center justify-center gap-3">
                  {signupLoading && <Loader2 size={20} className="animate-spin" />}
                  Criar Conta
                </button>
              </div>
            )}

            <button onClick={() => setIsPinModalOpen(true)}
              className="w-full p-4 bg-amber-50 border border-amber-200 rounded-2xl font-black uppercase text-[10px] tracking-widest text-amber-700">
              Abrir Direção por PIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Choose teacher (tablet / switch) ────────────────────────────────────────
  if (view === "choose_teacher") {
    const filtered = teachers.filter((t) => t.name.toLowerCase().includes(teacherSearch.toLowerCase()));
    const canOpenAdmin = session?.role === "admin";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        {toast}<PinModal />
        <div className="w-full max-w-md space-y-6">
          {canOpenAdmin && (
            <button onClick={() => setIsPinModalOpen(true)}
              className="w-full bg-slate-900 text-white p-7 rounded-[40px] shadow-2xl flex items-center justify-center gap-6 active:scale-[0.98] transition-all border border-slate-700">
              <ShieldCheck size={36} className="text-indigo-400" />
              <div className="text-left">
                <p className="font-black text-xl leading-none">Acesso Direção</p>
                <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[2px] mt-1">Gestão Centralizada</p>
              </div>
            </button>
          )}
          <div className="bg-white rounded-[56px] shadow-2xl p-12 border text-center space-y-10">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter leading-none mb-3 underline decoration-indigo-500 decoration-8 underline-offset-8">
                Portal Staff
              </h1>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[4px] mt-8 leading-none">Quem está a aceder hoje?</p>
              <div className="mt-4 flex items-center justify-center">
                {tabletMode
                  ? <span className="px-2 py-1 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 uppercase flex items-center gap-1"><Tablet size={12} /> Tablet ON</span>
                  : <span className="text-[9px] font-black uppercase tracking-[3px] text-slate-500">Trocar professor (sem confirmação)</span>}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
              <input className="w-full bg-slate-50 p-5 pl-14 rounded-[24px] border-2 border-slate-50 outline-none font-bold"
                placeholder="Escreva o nome do professor..."
                value={teacherSearch} onChange={(e) => setTeacherSearch(e.target.value)} />
            </div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 text-left">
              {filtered.map((t) => (
                <button key={t.id} onClick={() => { setActingTeacher(t); setOriginView("teacher_home"); setView("teacher_home"); }}
                  className="w-full p-6 flex items-center justify-between bg-white border-2 border-slate-50 rounded-[32px] hover:border-indigo-500 hover:shadow-xl transition-all active:scale-[0.98] shadow-sm">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex justify-center items-center shadow-inner">
                      <Users size={28} />
                    </div>
                    <div className="text-left">
                      <p className="font-black text-slate-800 tracking-tight text-xl leading-none">{t.name}</p>
                      <p className="text-[10px] text-slate-400 font-black uppercase mt-1 tracking-widest leading-none">Ligação Ativa</p>
                    </div>
                  </div>
                  <ChevronRight size={22} className="text-slate-200" />
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              {!tabletMode && (
                <button onClick={() => { setTeacherSearch(""); setView("teacher_home"); }}
                  className="flex-1 p-5 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-wider shadow-sm active:scale-95">
                  Voltar
                </button>
              )}
              <button onClick={() => setTeacherSearch("")}
                className="flex-1 p-5 bg-slate-100 text-slate-600 rounded-[28px] font-black uppercase tracking-wider shadow-sm active:scale-95">
                Limpar
              </button>
            </div>
            {!tabletMode && (
              <button onClick={handleLogout}
                className="w-full p-5 bg-white border rounded-[28px] font-black uppercase tracking-wider text-slate-500 active:scale-95">
                Voltar ao Login
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main authenticated views ────────────────────────────────────────────────
  return (
    <div className="antialiased font-sans min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100">
      {toast}<PinModal />

      {view === "teacher_home" && actingTeacher && (
        <TeacherHome
          actingTeacher={actingTeacher}
          tabletMode={tabletMode}
          classes={classes} logs={logs} lessonPlans={lessonPlans}
          setView={setView} setSelectedClass={setSelectedClass} setOriginView={setOriginView}
          onSwitchTeacher={() => { setView("choose_teacher"); setTeacherSearch(""); }}
          onOpenAdmin={() => setIsPinModalOpen(true)}
          onExit={() => {
            if (tabletMode) { setView("choose_teacher"); setActingTeacher(null); return; }
            handleLogout();
          }}
          canOpenAdmin={session?.role === "admin"}
        />
      )}

      {view === "admin_home" && (
        <AdminDashboard
          teachers={teachers} classes={classes} lessonPlans={lessonPlans}
          logs={logs} accounts={accounts} tabletMode={tabletMode}
          notify={notify} setView={setView}
          setSelectedClass={setSelectedClass} setOriginView={setOriginView}
          adminPin={adminPin} setAdminPin={setAdminPin} setTabletMode={setTabletMode}
          onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove}
        />
      )}

      {view === "class_history" && selectedClass && (
        <ClassHistory selectedClass={selectedClass} logs={logs} setView={setView} originView={originView} />
      )}

      {view === "class_plan_view" && selectedClass && (
        <ClassPlanView selectedClass={selectedClass} lessonPlans={lessonPlans} logs={logs} setView={setView} originView={originView} />
      )}

      {view === "log_lesson" && selectedClass && (
        <LogLesson
          selectedClass={selectedClass} teachers={teachers}
          lessonPlans={lessonPlans} logs={logs}
          setView={setView} notify={notify} originView={originView}
          onCreateLog={onCreateLog}
        />
      )}
    </div>
  );
}
