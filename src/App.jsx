import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Users, PlusCircle, History, ChevronRight, CheckCircle2,
  TrendingUp, TrendingDown, Calendar, LogOut, DollarSign,
  Settings, ArrowLeft, Trash2, UserPlus, Plus, Layout,
  Briefcase, ListChecks, Edit3, Search, ShieldCheck, Lock,
  KeyRound, Loader2, BookOpen, Map, UserCheck, Type, Bell,
  Activity, CheckSquare, Square, Mic2, Info, Clock, Tablet,
  UserCog, Mail, Phone,
  Repeat, Send, AlertTriangle, BarChart3, UserX,
  Archive, ArchiveRestore, X,
} from "lucide-react";

import logoNancy from "./assets/logo-nancy.png";
import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
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

// ─── Substitutions helpers & constants ──────────────────────────────────────
const SCHOOLS = ["CKC", "Benguela", "Lobito"];
const TK_SCHOOLS = ["CKC", "Lobito"]; // TK Exercise só nestas
const EXAM_ROUNDS = ["1ª", "2ª", "3ª"];
const BOOK_HALVES = ["1ª metade", "2ª metade"];
const SUB_TIMES = ["08:00", "09:10", "10:20", "12:00", "13:10", "14:20", "15:30", "16:45", "18:10", "19:20"];
const SUB_BOOKS = [
  "Book 1 — Part 1", "Book 1 — Part 2", "Book 2 — Part 1", "Book 2 — Part 2",
  "Book 3 — Part 1", "Book 3 — Part 2", "Book 4 — Part 1", "Book 4 — Part 2",
  "Book 5 — Part 1", "Book 5 — Part 2", "Book 6 — Part 1", "Book 6 — Part 2", "Book 7",
];
const SUB_LESSON_TYPES = ["Aula normal", "Aula de comunicação", "Prática oral", "Ditado", "Revisão", "Pré-teste", "Exame oral", "Exame escrito"];
const SUB_REASONS = ["Médico / saúde", "Emergência familiar", "Pessoal", "Viagem de trabalho", "Outro"];

const subWeekRange = () => {
  const n = new Date(), d = n.getDay(), m = new Date(n);
  m.setDate(n.getDate() - (d === 0 ? 6 : d - 1));
  const s = new Date(m); s.setDate(m.getDate() + 6);
  return [m.toISOString().split("T")[0], s.toISOString().split("T")[0]];
};
const fmtDatePt = (d) => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
const getYM = (d) => (d ? d.slice(0, 7) : "");
const fmtMonthPt = (ym) => {
  const [y, m] = ym.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
};
const subInitials = (n) => (n || "??").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const openExternalUrl = (url) => { const w = window.open(url, "_blank", "noopener,noreferrer"); if (!w) window.location.href = url; };
const TUNER_WEEKLY_PLAN_URL = "https://forms.gle/gxtmUQ6xF41YoLfg9";
const TUNER_OBSERVATION_URL = "https://forms.gle/uPGFZLzxDbzjvqxA9";
const twoHoursOk = (dv, tv) => { if (!dv || !tv) return true; return (new Date(dv + "T" + tv) - new Date()) / 60000 >= 120; };
const fmtTS = (ts) => { if (!ts) return ""; try { return ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

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
      activeBlock: null, progressNote: "", dictationCount: 0, lastWord: "", lastLog: null, planComplete: false, lessonDelta: 0 };

  const plan = lessonPlans.find((p) => p.id === classObj.lessonPlanId);
  const planStart = classObj.planStartDate || null;
  const classLogs = (logs || [])
    .filter((l) => l.classId === classId)
    .filter((l) => !planStart || (l.date || "") >= planStart)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const lastLog = classLogs[classLogs.length - 1] || null;
  const lastEndPage = lastLog ? parseInt(lastLog.endPage || 0, 10) : 0;
  const dictationCount = classLogs.reduce((a, l) => a + (Number.isFinite(l.dictationCount) ? l.dictationCount : (l.dictation ? 1 : 0)), 0);

  if (!plan?.blocks?.length)
    return { lastEndPage, status: "ON TRACK", statusLabel: "SEM PLANO",
      colorClass: "text-slate-500 bg-slate-100 border-slate-200",
      activeBlock: null, progressNote: "", dictationCount,
      lastWord: lastLog?.lastWord || "", lastLog, planComplete: false, noPlan: true, lessonDelta: 0 };

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

  const planLastPage = parseInt(plan.blocks[plan.blocks.length - 1].endPage || 0, 10) || 0;
  const planComplete = lastEndPage > 0 && lastEndPage >= planLastPage;
  const pagesLeft   = Math.max(0, blockEnd - lastEndPage);
  const lessonsLeft = Math.max(0, expectedLessonsForBlock - lessonsInCurrentBlock);
  let progressNote = "";
  if (pagesLeft === 0) progressNote = "Fase concluída! Siga para o próximo bloco.";
  else if (lessonsLeft > 0) progressNote = `Faltam ${pagesLeft} páginas para terminar em ${lessonsLeft} aulas`;
  else progressNote = `Atraso: faltam ${pagesLeft} páginas (aulas planeadas já usadas)`;

  return { lastEndPage, status, statusLabel, colorClass, activeBlock,
    progressNote, dictationCount, lastWord: lastLog?.lastWord || "", lastLog, planComplete, noPlan: false, lessonDelta: Math.round(lessonDelta) };
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
  onSwitchTeacher, onOpenAdmin, onOpenSubs, onExit, canOpenAdmin, onSetClassPlan,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const myClasses = useMemo(() => {
    if (!actingTeacher) return [];
    const st = searchTerm.toLowerCase();
    return classes
      .filter((c) => c.teacherId === actingTeacher.id)
      .filter((c) => c.active !== false)
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
            <button onClick={onOpenSubs} className="p-2 bg-indigo-50 text-indigo-600 rounded-full active:scale-90 transition-all shadow-sm" title="Substituições">
              <Repeat size={20} />
            </button>
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
              {(prog.planComplete || prog.noPlan) && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 mb-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                    <BookOpen size={14} /> {prog.noPlan ? "Sem plano" : "Plano concluído 🎉"}
                  </p>
                  <p className="text-[11px] font-bold text-indigo-500 mt-1 mb-2">Escolher o próximo plano para esta turma:</p>
                  <select className="w-full p-3 bg-white border-2 border-indigo-100 rounded-xl font-bold text-sm outline-none"
                    value="" onChange={(e) => { if (e.target.value) onSetClassPlan(cls.id, e.target.value); }}>
                    <option value="">Selecionar plano...</option>
                    {lessonPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
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
  const [dictationCount, setDictationCount] = useState("");
  const [oralSkillCount, setOralSkillCount] = useState("");
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

        <div className="grid grid-cols-2 gap-4">
          <div className="p-5 bg-slate-50 rounded-[32px] border-2 border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Mic2 size={20} /></div><p className="font-black text-slate-700 text-sm leading-none">Ditados</p></div>
            <input type="number" min="0" placeholder="0"
              className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-2xl text-center outline-none focus:border-indigo-500"
              value={dictationCount} onChange={(e) => setDictationCount(e.target.value)} />
          </div>
          <div className="p-5 bg-slate-50 rounded-[32px] border-2 border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><Activity size={20} /></div><p className="font-black text-slate-700 text-sm leading-none">Oral skills</p></div>
            <input type="number" min="0" placeholder="0"
              className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-2xl text-center outline-none focus:border-indigo-500"
              value={oralSkillCount} onChange={(e) => setOralSkillCount(e.target.value)} />
          </div>
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
            dictationCount: parseInt(dictationCount, 10) || 0,
            oralSkillCount: parseInt(oralSkillCount, 10) || 0,
            dictation: (parseInt(dictationCount, 10) || 0) > 0,
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
  subs = [], onDeleteSub,
  examReqs = [], recoveryReqs = [], physExams = [], tkExercises = [],
  onDeleteTunerRequest, onDeleteAssistantRequest,
  tab, setTab,
}) => {
  const [viewSchool, setViewSchool] = useState("all");
  const [subDirTab, setSubDirTab] = useState("records");
  const [subFilDate, setSubFilDate] = useState("all");
  const [subFilStatus, setSubFilStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddingCls, setIsAddingCls] = useState(false);
  const [newCls, setNewCls] = useState({ time: "", room: "", lessonPlanId: "", teacherId: "", school: "", type: "DM" });
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ name: "", rate: 2000 });
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editingClassId, setEditingClassId] = useState(null);
  const [editCls, setEditCls] = useState({ time: "", room: "", teacherId: "", lessonPlanId: "", school: "", type: "DM" });
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [activePlan, setActivePlan] = useState({ name: "", blocks: [] });
  const [newPinInput, setNewPinInput] = useState("");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ teacherId: "", name: "", phone: "", email: "", password: "", role: "teacher" });
  const [accountError, setAccountError] = useState("");
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editAccount, setEditAccount] = useState({ teacherId: "", role: "teacher", name: "", schools: [] });

  const filteredClasses = useMemo(() => {
    const st = searchTerm.toLowerCase();
    return classes
      .filter((c) => viewSchool === "all" || c.school === viewSchool)
      .filter((c) => c.name.toLowerCase().includes(st));
  }, [classes, searchTerm, viewSchool]);

  const missingLogsYesterday = useMemo(() => {
    const yesterday = getYesterdayStr();
    return classes.filter((cls) => cls.active !== false && !logs.some((l) => l.classId === cls.id && l.date === yesterday));
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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {["all", ...SCHOOLS].map((s) => (
              <button key={s} onClick={() => setViewSchool(s)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${viewSchool === s ? "bg-white text-slate-900" : "bg-slate-800 text-slate-400"}`}>
                {s === "all" ? "Todas" : s}
              </button>
            ))}
            <button onClick={() => setView("teacher_home")} className="p-2 bg-slate-800 rounded-full active:scale-90 ml-1">
              <LogOut size={20} />
            </button>
          </div>
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
            { id: "analises", label: "Análises",   icon: BarChart3 },
            { id: "teachers", label: "Staff",      icon: Briefcase },
            { id: "plans",    label: "Planos",     icon: BookOpen  },
            { id: "accounts", label: "Contas",     icon: UserCog   },
            { id: "subs",     label: "Substituições", icon: Repeat },
            { id: "pedidos",  label: "Pedidos",    icon: ListChecks },
            { id: "settings", label: "Tablet",     icon: KeyRound  },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${tab === t.id ? "bg-white text-slate-900 shadow-xl scale-105" : "bg-slate-800 text-slate-400"}`}>
              <t.icon size={14} /> {t.label.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="px-6 space-y-6">

        {/* ── ANÁLISES (registos do mês) ── */}
        {tab === "analises" && (() => {
          const ym = getYM(getTodayStr());
          const day = parseInt(getTodayStr().slice(8, 10), 10) || 1;
          const weeks = Math.max(1, Math.ceil(day / 7));
          const cls = classes.filter((c) => c.active !== false && (viewSchool === "all" || c.school === viewSchool));
          const clsIds = new Set(cls.map((c) => c.id));
          const monthLogs = logs.filter((l) => getYM(l.date) === ym && (viewSchool === "all" || clsIds.has(l.classId)));
          const monthSubs = subs.filter((s) => getYM(s.date) === ym);
          const teacherList = teachers.filter((t) => cls.some((c) => c.teacherId === t.id));
          let behind = 0, on = 0, ahead = 0;
          cls.forEach((c) => { const st = calculateProgress(c.id, logs, lessonPlans, c).status; if (st === "BEHIND") behind++; else if (st === "AHEAD") ahead++; else on++; });
          const dcount = (l) => (Number.isFinite(l.dictationCount) ? l.dictationCount : (l.dictation ? 1 : 0));
          const ocount = (l) => (Number.isFinite(l.oralSkillCount) ? l.oralSkillCount : 0);
          const teacherName = (id) => teachers.find((t) => t.id === id)?.name || "S/D";
          const perClass = cls.map((c) => {
            const cl = monthLogs.filter((l) => l.classId === c.id);
            const ditados = cl.reduce((a, l) => a + dcount(l), 0);
            const oral = cl.reduce((a, l) => a + ocount(l), 0);
            const p = calculateProgress(c.id, logs, lessonPlans, c);
            return { c, aulas: cl.length, ditados, oral, status: p.status, statusLabel: p.statusLabel, delta: p.lessonDelta || 0, dictOk: ditados >= weeks };
          }).sort((a, b) => a.c.name.localeCompare(b.c.name));
          const perTeacher = teacherList.map((t) => {
            const tl = monthLogs.filter((l) => l.teacherId === t.id);
            const ditados = tl.reduce((a, l) => a + dcount(l), 0);
            const faltas = monthSubs.filter((s) => s.absentTeacherId === t.id).length;
            const behindCls = cls.filter((c) => c.teacherId === t.id && calculateProgress(c.id, logs, lessonPlans, c).status === "BEHIND").length;
            return { t, aulas: tl.length, ditados, faltas, behindCls, dictOk: ditados >= weeks };
          }).sort((a, b) => b.faltas - a.faltas);
          const aulasMes = monthLogs.length, ditadosMes = monthLogs.reduce((a, l) => a + dcount(l), 0), oralMes = monthLogs.reduce((a, l) => a + ocount(l), 0), faltasMes = monthSubs.length;
          const maxFal = Math.max(1, ...perTeacher.map((p) => p.faltas));
          const card = (n, label, color) => (
            <div className="bg-white rounded-[24px] p-5 border text-center shadow-sm"><p className={`text-3xl font-black ${color}`}>{n}</p><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{label}</p></div>
          );
          const barRow = (name, val, max, color) => (
            <div key={name} className="flex items-center gap-2 my-1.5">
              <div className="text-[12px] font-bold text-slate-700 w-24 truncate" title={name}>{name}</div>
              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(val / max * 100)}%` }} /></div>
              <div className="text-[11px] font-black text-slate-500 w-6 text-right">{val}</div>
            </div>
          );
          const stBadge = (status, label) => {
            const c = status === "BEHIND" ? "bg-red-50 text-red-600 border-red-200" : status === "AHEAD" ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-green-50 text-green-700 border-green-200";
            return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${c}`}>{label}</span>;
          };
          return (
            <div className="space-y-4 text-left">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 px-1">Mês: {fmtMonthPt(ym)} · {weeks} semana(s){viewSchool !== "all" ? ` · ${viewSchool}` : ""}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {card(aulasMes, "Aulas no mês", "text-indigo-600")}
                {card(ditadosMes, "Ditados", "text-emerald-600")}
                {card(oralMes, "Oral skills", "text-blue-600")}
                {card(faltasMes, "Faltas", "text-amber-600")}
              </div>

              {/* TURMA POR TURMA */}
              <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><Layout size={14} /> Turma por turma ({fmtMonthPt(ym)})</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[560px]">
                    <thead><tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b">
                      <th className="p-2">Turma</th><th className="p-2">Professor</th><th className="p-2">Aulas</th><th className="p-2">Ditados</th><th className="p-2">Oral</th><th className="p-2">Estado</th><th className="p-2">Atraso/Avanço</th><th className="p-2"></th>
                    </tr></thead>
                    <tbody>
                      {perClass.map((p) => (
                        <tr key={p.c.id} className="border-b last:border-0">
                          <td className="p-2 font-black text-slate-800">{p.c.name}<span className="text-[9px] text-slate-400 ml-1">{p.c.type || "DM"}</span></td>
                          <td className="p-2 font-bold text-slate-600">{teacherName(p.c.teacherId)}</td>
                          <td className="p-2 font-bold text-slate-600">{p.aulas}</td>
                          <td className="p-2 font-bold"><span className={p.dictOk ? "text-emerald-600" : "text-amber-600"}>{p.ditados}</span> <span className="text-slate-300">/ {weeks}</span></td>
                          <td className="p-2 font-bold text-slate-600">{p.oral}</td>
                          <td className="p-2">{stBadge(p.status, p.statusLabel)}</td>
                          <td className="p-2 font-black">{p.delta < 0 ? <span className="text-red-500">{Math.abs(p.delta)} aula(s) atraso</span> : p.delta > 0 ? <span className="text-blue-600">{p.delta} aula(s) adianto</span> : <span className="text-slate-400">—</span>}</td>
                          <td className="p-2"><button onClick={() => { setSelectedClass(p.c); setOriginView("admin_home"); setView("class_history"); }} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 flex items-center gap-1"><History size={13} /> Histórico</button></td>
                        </tr>
                      ))}
                      {!perClass.length && <tr><td colSpan={8} className="p-6 text-center text-slate-400 font-bold">Sem turmas{viewSchool !== "all" ? ` em ${viewSchool}` : ""}.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><Activity size={14} /> Estado das turmas</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-red-50 rounded-2xl p-4 text-center border border-red-100"><p className="text-2xl font-black text-red-500">{behind}</p><p className="text-[9px] font-black uppercase text-slate-400 mt-1">Atrasadas</p></div>
                  <div className="bg-green-50 rounded-2xl p-4 text-center border border-green-100"><p className="text-2xl font-black text-green-600">{on}</p><p className="text-[9px] font-black uppercase text-slate-400 mt-1">Em dia</p></div>
                  <div className="bg-blue-50 rounded-2xl p-4 text-center border border-blue-100"><p className="text-2xl font-black text-blue-600">{ahead}</p><p className="text-[9px] font-black uppercase text-slate-400 mt-1">Adiantadas</p></div>
                </div>
              </div>

              <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><UserX size={14} /> Faltas por professor</div>
                {perTeacher.some((p) => p.faltas > 0) ? perTeacher.filter((p) => p.faltas > 0).map((p) => barRow(p.t.name, p.faltas, maxFal, "bg-red-500")) : <div className="text-center py-4 text-emerald-600 font-bold text-sm">Sem faltas este mês.</div>}
              </div>
            </div>
          );
        })()}

        {/* ── CLASSES ── */}
        {tab === "classes" && (
          <div className="space-y-4 text-left">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 outline-none shadow-sm font-bold text-sm"
                placeholder="Pesquisar Turma..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {(() => {
              const activeAll = classes.filter((c) => c.active !== false && (viewSchool === "all" || c.school === viewSchool));
              let nBehind = 0, nOn = 0, nAhead = 0;
              activeAll.forEach((c) => { const s = calculateProgress(c.id, logs, lessonPlans, c).status; if (s === "BEHIND") nBehind++; else if (s === "AHEAD") nAhead++; else nOn++; });
              return (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-2xl p-4 border text-center shadow-sm"><p className="text-2xl font-black text-red-500">{nBehind}</p><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Atrasadas</p></div>
                  <div className="bg-white rounded-2xl p-4 border text-center shadow-sm"><p className="text-2xl font-black text-green-600">{nOn}</p><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Em dia</p></div>
                  <div className="bg-white rounded-2xl p-4 border text-center shadow-sm"><p className="text-2xl font-black text-blue-600">{nAhead}</p><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Adiantadas</p></div>
                </div>
              );
            })()}
            <button onClick={() => { setNewCls((p) => ({ ...p, school: viewSchool !== "all" ? viewSchool : "" })); setIsAddingCls(true); }}
              className="w-full p-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-wider shadow-lg active:scale-95 flex items-center justify-center gap-2">
              <Plus size={20} /> Nova Turma
            </button>
            {isAddingCls && (
              <div className="bg-white p-6 rounded-[32px] shadow-2xl space-y-4 text-left border">
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newCls.teacherId} onChange={(e) => setNewCls({ ...newCls, teacherId: e.target.value })}>
                  <option value="">Docente Titular...</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newCls.time} onChange={(e) => setNewCls({ ...newCls, time: e.target.value })}>
                  <option value="">Hora...</option>
                  {SUB_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Sala" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newCls.room} onChange={(e) => setNewCls({ ...newCls, room: e.target.value })} />
                <div className="flex gap-2">
                  <select className="flex-1 p-4 bg-slate-50 border rounded-2xl font-bold"
                    value={newCls.school} onChange={(e) => setNewCls({ ...newCls, school: e.target.value })}>
                    <option value="">Escola...</option>
                    {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select className="flex-1 p-4 bg-slate-50 border rounded-2xl font-bold"
                    value={newCls.type} onChange={(e) => setNewCls({ ...newCls, type: e.target.value })}>
                    <option value="DM">DM</option>
                    <option value="TK">TK</option>
                  </select>
                </div>
                <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold"
                  value={newCls.lessonPlanId} onChange={(e) => setNewCls({ ...newCls, lessonPlanId: e.target.value })}>
                  <option value="">Plano de Livro...</option>
                  {lessonPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {newCls.teacherId && newCls.time && (
                  <p className="text-[11px] font-bold text-indigo-600 px-1">Nome da turma: <span className="font-black">{teachers.find((t) => t.id === newCls.teacherId)?.name} • {newCls.time}</span></p>
                )}
                <button onClick={async () => {
                  if (!newCls.teacherId || !newCls.time) return notify("Erro: escolha professor e hora!");
                  if (!newCls.school) return notify("Erro: escolha a escola!");
                  const tName = teachers.find((t) => t.id === newCls.teacherId)?.name || "";
                  await onAdd("classes", { name: `${tName} • ${newCls.time}`, time: newCls.time, room: newCls.room, teacherId: newCls.teacherId, lessonPlanId: newCls.lessonPlanId, school: newCls.school, type: newCls.type || "DM", active: true });
                  setIsAddingCls(false);
                  setNewCls({ time: "", room: "", lessonPlanId: "", teacherId: "", school: "", type: "DM" });
                  notify("Turma criada!");
                }} className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase shadow-lg">
                  Gravar
                </button>
              </div>
            )}
            {filteredClasses.filter((c) => c.active !== false).map((cls) => {
              const prog = calculateProgress(cls.id, logs, lessonPlans, cls);
              return (
              <div key={cls.id} className="bg-white p-5 rounded-[32px] border text-left shadow-sm">
                <div className="flex items-center justify-between">
                  <div onClick={() => { setSelectedClass(cls); setOriginView("admin_home"); setView("class_history"); }}
                    className="cursor-pointer flex-1 min-w-0">
                    <p className="font-black text-slate-800 text-xl tracking-tighter leading-none truncate">{cls.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      {teachers.find((t) => t.id === cls.teacherId)?.name || "S/D"} • Sala {cls.room}{cls.school ? ` • ${cls.school}` : ""} • {cls.type || "DM"}
                    </p>
                    <div className="mt-2 inline-flex gap-2 items-center"><Badge status={prog.status} label={prog.statusLabel} colorClass={prog.colorClass} /></div>
                  </div>
                  <button onClick={() => openAttendance(cls, { id: cls.teacherId })}
                    className="p-2 rounded-xl bg-slate-900 text-white mr-2 active:scale-90" title="Presenças">
                    <Users size={18} />
                  </button>
                  <button onClick={() => {
                    if (editingClassId === cls.id) { setEditingClassId(null); }
                    else { setEditingClassId(cls.id); setEditCls({ time: cls.time || "", room: cls.room || "", teacherId: cls.teacherId || "", lessonPlanId: cls.lessonPlanId || "", school: cls.school || "", type: cls.type || "DM" }); }
                  }} className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 active:scale-90 mr-2" title="Editar">
                    <Edit3 size={18} />
                  </button>
                  <button onClick={async () => window.confirm(`Arquivar "${cls.name}"? Deixa de aparecer ao professor, mas o histórico é mantido.`) && (await onUpdate("classes", cls.id, { active: false }))}
                    className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 active:scale-90 mr-2" title="Arquivar">
                    <Archive size={18} />
                  </button>
                  <button onClick={async () => window.confirm(`Eliminar "${cls.name}" definitivamente? O histórico desta turma perde-se.`) && (await onRemove("classes", cls.id))}
                    className="text-slate-200 hover:text-red-500 p-2" title="Eliminar">
                    <Trash2 size={20} />
                  </button>
                </div>
                {editingClassId === cls.id && (
                  <div className="mt-4 space-y-3 bg-slate-50 rounded-2xl p-4 border">
                    <div><span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Professor</span>
                      <select className="w-full p-3 bg-white border rounded-xl font-bold text-sm" value={editCls.teacherId} onChange={(e) => setEditCls((p) => ({ ...p, teacherId: e.target.value }))}>
                        <option value="">— nenhum —</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select></div>
                    <div><span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Hora</span>
                      <select className="w-full p-3 bg-white border rounded-xl font-bold text-sm" value={editCls.time} onChange={(e) => setEditCls((p) => ({ ...p, time: e.target.value }))}>
                        <option value="">— hora —</option>{SUB_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div className="flex gap-2">
                      <div className="flex-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Escola</span>
                        <select className="w-full p-3 bg-white border rounded-xl font-bold text-sm" value={editCls.school} onChange={(e) => setEditCls((p) => ({ ...p, school: e.target.value }))}>
                          <option value="">—</option>{SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select></div>
                      <div className="flex-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Tipo</span>
                        <select className="w-full p-3 bg-white border rounded-xl font-bold text-sm" value={editCls.type} onChange={(e) => setEditCls((p) => ({ ...p, type: e.target.value }))}>
                          <option value="DM">DM</option><option value="TK">TK</option>
                        </select></div>
                    </div>
                    <div><span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Sala</span>
                      <input className="w-full p-3 bg-white border rounded-xl font-bold text-sm" value={editCls.room} onChange={(e) => setEditCls((p) => ({ ...p, room: e.target.value }))} /></div>
                    <div><span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Plano de aulas</span>
                      <select className="w-full p-3 bg-white border rounded-xl font-bold text-sm" value={editCls.lessonPlanId} onChange={(e) => setEditCls((p) => ({ ...p, lessonPlanId: e.target.value }))}>
                        <option value="">— sem plano —</option>{lessonPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select></div>
                    {editCls.teacherId && editCls.time && (
                      <p className="text-[11px] font-bold text-indigo-600 px-1">Nome: <span className="font-black">{teachers.find((t) => t.id === editCls.teacherId)?.name} • {editCls.time}</span></p>
                    )}
                    <button onClick={async () => {
                      const planChanged = (editCls.lessonPlanId || "") !== (cls.lessonPlanId || "");
                      const tName = teachers.find((t) => t.id === editCls.teacherId)?.name || "";
                      const name = (tName && editCls.time) ? `${tName} • ${editCls.time}` : cls.name;
                      await onUpdate("classes", cls.id, {
                        name, time: editCls.time || cls.time || "", room: editCls.room.trim(),
                        teacherId: editCls.teacherId, lessonPlanId: editCls.lessonPlanId,
                        school: editCls.school || "", type: editCls.type || "DM",
                        ...(planChanged ? { planStartDate: getTodayStr() } : {}),
                      });
                      setEditingClassId(null);
                      notify(planChanged ? "Turma atualizada. Progresso recomeça para o novo plano." : "Turma atualizada.");
                    }} className="w-full p-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95">
                      Guardar alterações
                    </button>
                  </div>
                )}
              </div>
              );
            })}

            {filteredClasses.some((c) => c.active === false) && (
              <div className="pt-2">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 mt-4">
                  <Archive size={14} /> Arquivadas <span className="flex-1 h-px bg-slate-200" />
                </div>
                <div className="space-y-3">
                  {filteredClasses.filter((c) => c.active === false).map((cls) => (
                    <div key={cls.id} className="bg-slate-50 p-5 rounded-[32px] border flex items-center justify-between text-left">
                      <div onClick={() => { setSelectedClass(cls); setOriginView("admin_home"); setView("class_history"); }}
                        className="cursor-pointer flex-1 min-w-0">
                        <p className="font-black text-slate-500 text-xl tracking-tighter leading-none truncate">{cls.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                          {teachers.find((t) => t.id === cls.teacherId)?.name || "S/D"} • Sala {cls.room} • arquivada
                        </p>
                      </div>
                      <button onClick={async () => await onUpdate("classes", cls.id, { active: true })}
                        className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 active:scale-90 mr-2" title="Reativar">
                        <ArchiveRestore size={18} />
                      </button>
                      <button onClick={async () => window.confirm("Eliminar definitivamente? O histórico desta turma perde-se.") && (await onRemove("classes", cls.id))}
                        className="text-slate-300 hover:text-red-500 p-2" title="Eliminar">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                      <p className="text-[11px] font-black text-green-600 mt-1">
                        {logs.filter((l) => l.teacherId === t.id).length} aulas · {(logs.filter((l) => l.teacherId === t.id).length * (t.rate || 0)).toLocaleString()} AKZ
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

        {/* ── ACCOUNTS ── */}
        {tab === "accounts" && (
          <div className="space-y-4 text-left">
            <div className="bg-white rounded-[32px] p-5 border shadow-sm">
              <div className="flex items-start gap-3">
                <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-slate-700 leading-relaxed">
                  Os professores <span className="font-black">criam a conta sozinhos</span> (email ou Google). Aqui você <span className="font-black">aprova o acesso</span> e atribui o cargo e o professor. Contas <span className="font-black">Pendentes</span> ainda não têm acesso.
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
                  <option value="tuner">Tuner</option>
                  <option value="assistant">Assistente</option>
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
              {accounts.filter((a) => viewSchool === "all" || (a.schools || []).includes(viewSchool)).map((a) => (
                <div key={a.id} className="py-5 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 leading-none truncate">{a.name || "(sem nome)"}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest truncate">
                        {a.email}{a.role === "admin" ? " • ADMIN" : a.role === "tuner" ? " • TUNER" : a.role === "assistant" ? " • ASSISTENTE" : a.role === "teacher" ? " • PROFESSOR" : ""}{a.schools?.length ? ` • ${a.schools.join("/")}` : ""}{a.phone ? ` • ${a.phone}` : ""}
                      </p>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${a.activated ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}`}>
                        {a.activated ? "Ativo" : "Pendente"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => {
                        if (editingAccountId === a.id) { setEditingAccountId(null); }
                        else { setEditingAccountId(a.id); setEditAccount({ teacherId: a.teacherId || "", role: a.role || "teacher", name: a.name || "", schools: a.schools || [] }); }
                      }} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 ${a.activated ? "bg-slate-100 text-slate-500" : "bg-indigo-600 text-white shadow"}`}>
                        {a.activated ? "Editar" : "Aprovar"}
                      </button>
                      <button onClick={async () => window.confirm("Remover conta?") && (await onRemove("accounts", a.id))}
                        className="text-slate-200 hover:text-red-500">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  {editingAccountId === a.id && (
                    <div className="mt-4 space-y-3 bg-slate-50 rounded-2xl p-4 border">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Nome</p>
                        <input className="w-full p-3 bg-white border rounded-xl font-bold text-sm"
                          placeholder="Nome da pessoa"
                          value={editAccount.name} onChange={(e) => setEditAccount((p) => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Cargo</p>
                        <select className="w-full p-3 bg-white border rounded-xl font-bold text-sm"
                          value={editAccount.role} onChange={(e) => setEditAccount((p) => ({ ...p, role: e.target.value }))}>
                          <option value="teacher">Professor</option>
                          <option value="tuner">Tuner</option>
                          <option value="assistant">Assistente</option>
                          <option value="admin">Admin (Direção)</option>
                        </select>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Escola(s)</p>
                        <div className="flex gap-2">
                          {SCHOOLS.map((s) => {
                            const on = (editAccount.schools || []).includes(s);
                            return (
                              <button key={s} type="button"
                                onClick={() => setEditAccount((p) => ({ ...p, schools: on ? (p.schools || []).filter((x) => x !== s) : [...(p.schools || []), s] }))}
                                className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-400 border-slate-100"}`}>
                                {s}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {editAccount.role !== "admin" && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Professor associado</p>
                          <select className="w-full p-3 bg-white border rounded-xl font-bold text-sm"
                            value={editAccount.teacherId} onChange={(e) => setEditAccount((p) => ({ ...p, teacherId: e.target.value }))}>
                            <option value="">— escolher —</option>
                            <option value="__new__">➕ Criar novo professor (com o nome acima)</option>
                            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                      )}
                      <button onClick={async () => {
                        const name = (editAccount.name || "").trim();
                        if (!name) { notify("Escreva o nome."); return; }
                        let teacherId = editAccount.teacherId;
                        if (editAccount.role !== "admin") {
                          if (!teacherId) { notify("Escolha ou crie o professor associado."); return; }
                          if (teacherId === "__new__") {
                            const ref = await onAdd("teachers", { name, rate: 2000, active: true });
                            teacherId = ref?.id || "";
                          }
                        } else {
                          teacherId = "";
                        }
                        await onUpdate("users", a.id, {
                          role: editAccount.role || "teacher",
                          teacherId,
                          name,
                          schools: editAccount.schools || [],
                          activated: true,
                        });
                        setEditingAccountId(null);
                        notify(a.activated ? "Conta atualizada!" : "Acesso aprovado!");
                      }} className="w-full p-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95">
                        {a.activated ? "Guardar alterações" : "Aprovar acesso"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SUBSTITUTIONS (director) ── */}
        {tab === "subs" && (() => {
          const td = getTodayStr();
          const [wS, wE] = subWeekRange();
          const total = subs.length;
          const todayCount = subs.filter((r) => r.date === td).length;
          const unconf = subs.filter((r) => !r.confirmed && r.date >= td).length;
          const weekCount = subs.filter((r) => r.date >= wS && r.date <= wE).length;

          let recs = [...subs];
          if (subFilDate === "today") recs = recs.filter((r) => r.date === td);
          else if (subFilDate === "week") recs = recs.filter((r) => r.date >= wS && r.date <= wE);
          else if (subFilDate === "past") recs = recs.filter((r) => r.date < td);
          if (subFilStatus === "pending") recs = recs.filter((r) => !r.confirmed);
          else if (subFilStatus === "confirmed") recs = recs.filter((r) => r.confirmed);
          recs.sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time));

          const subCount = {}, absCount = {}, riskCount = {}, byMonth = {}, bonusMap = {};
          subs.forEach((r) => {
            subCount[r.subName] = (subCount[r.subName] || 0) + 1;
            absCount[r.absentName] = (absCount[r.absentName] || 0) + 1;
            if (r.date < td && !r.confirmed) riskCount[r.subName] = (riskCount[r.subName] || 0) + 1;
            const ym = getYM(r.date);
            if (!byMonth[ym]) byMonth[ym] = { total: 0, confirmed: 0, pending: 0 };
            byMonth[ym].total++; r.confirmed ? byMonth[ym].confirmed++ : byMonth[ym].pending++;
            if (r.date < td && !r.confirmed) { if (!bonusMap[r.subName]) bonusMap[r.subName] = {}; bonusMap[r.subName][ym] = (bonusMap[r.subName][ym] || 0) + 1; }
          });
          const bar = (obj, color) => {
            const e = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 8);
            const mx = e[0] ? e[0][1] : 1;
            if (!e.length) return <div className="text-center py-4 text-slate-400 font-bold text-sm">Sem dados.</div>;
            return e.map(([name, c]) => (
              <div key={name} className="flex items-center gap-2 my-1.5">
                <div className="text-[12px] font-bold text-slate-700 w-28 truncate" title={name}>{name}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(c / mx * 100)}%` }} /></div>
                <div className="text-[11px] font-black text-slate-500 w-6 text-right">{c}</div>
              </div>
            ));
          };
          const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));
          const atRisk = Object.entries(bonusMap).filter(([, m]) => Object.values(m).some((c) => c >= 3));
          const selCls = "px-3 py-2 bg-slate-50 border rounded-xl font-bold text-sm";

          return (
            <div className="space-y-4 text-left">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[["Total", total, "text-indigo-600"], ["Hoje", todayCount, "text-emerald-600"], ["Por confirmar", unconf, "text-amber-600"], ["Esta semana", weekCount, "text-red-500"]].map(([l, n, c]) => (
                  <div key={l} className="bg-white rounded-[24px] p-5 border shadow-sm text-center">
                    <p className={`text-3xl font-black ${c}`}>{n}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{l}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {[["records", "Registos"], ["stats", "Estatísticas"], ["monthly", "Mensal"]].map(([k, l]) => (
                  <button key={k} onClick={() => setSubDirTab(k)}
                    className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest ${subDirTab === k ? "bg-indigo-600 text-white shadow" : "bg-white text-slate-500 border"}`}>{l}</button>
                ))}
              </div>

              {subDirTab === "records" && (
                <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                  <div className="flex gap-2 mb-4">
                    <select className={selCls} value={subFilDate} onChange={(e) => setSubFilDate(e.target.value)}>
                      <option value="all">Todas as datas</option><option value="today">Hoje</option><option value="week">Esta semana</option><option value="past">Passadas</option>
                    </select>
                    <select className={selCls} value={subFilStatus} onChange={(e) => setSubFilStatus(e.target.value)}>
                      <option value="all">Todos os estados</option><option value="pending">Por confirmar</option><option value="confirmed">Confirmadas</option>
                    </select>
                  </div>
                  {recs.length ? <div className="divide-y">{recs.map((r) => (
                    <div key={r.id} className="py-4 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${r.date === td ? "bg-indigo-50 text-indigo-600 border-indigo-200" : r.date < td ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>{r.date === td ? "Hoje" : fmtDatePt(r.date)}</span>
                          <span className="text-[11px] font-bold text-slate-400">{r.time}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${r.confirmed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{r.confirmed ? "Confirmado" : "Por confirmar"}</span>
                        </div>
                        <p className="font-black text-slate-800 text-sm mt-1">{r.absentName} <span className="font-medium text-slate-400">→ {r.subName}</span></p>
                        <p className="text-[11px] font-bold text-slate-400">{r.room} · {r.book} · p.{r.page} · {r.lessontype} · <span className="italic">{r.reason}</span></p>
                        {r.lessonnotes && <p className="text-[11px] text-slate-400 italic mt-0.5">"{r.lessonnotes}"</p>}
                        {r.confirmed && r.confirmedAt && <p className="text-[10px] text-emerald-600 font-bold mt-0.5">Confirmado às {fmtTS(r.confirmedAt)}</p>}
                      </div>
                      <button onClick={async () => window.confirm("Remover este registo?") && (await onDeleteSub(r.id))} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                    </div>
                  ))}</div> : <div className="text-center py-6 text-slate-400 font-bold text-sm">Nenhum registo corresponde ao filtro.</div>}
                </div>
              )}

              {subDirTab === "stats" && (
                <div className="space-y-4">
                  <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><UserCheck size={14} /> Top substitutos</div>{bar(subCount, "bg-indigo-500")}
                  </div>
                  <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><UserX size={14} /> Mais ausências</div>{bar(absCount, "bg-amber-500")}
                  </div>
                  <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><AlertTriangle size={14} /> Risco de pontualidade (não confirmadas passadas)</div>
                    {Object.keys(riskCount).length ? bar(riskCount, "bg-red-500") : <div className="text-center py-4 text-emerald-600 font-bold text-sm"><CheckCircle2 size={18} className="mx-auto mb-1" />Sem problemas de pontualidade.</div>}
                  </div>
                </div>
              )}

              {subDirTab === "monthly" && (
                <div className="space-y-4">
                  <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><Calendar size={14} /> Resumo mês a mês</div>
                    {months.length ? months.map(([ym, d]) => (
                      <div key={ym} className="flex items-center justify-between py-2 border-b last:border-0 flex-wrap gap-2">
                        <span className="font-black text-sm text-slate-800">{fmtMonthPt(ym)}</span>
                        <div className="flex gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 text-indigo-600 uppercase">{d.total} total</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 uppercase">{d.confirmed} confirmadas</span>
                          {d.pending > 0 && <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 uppercase">{d.pending} pendentes</span>}
                        </div>
                      </div>
                    )) : <div className="text-center py-6 text-slate-400 font-bold text-sm">Sem registos.</div>}
                  </div>
                  <div className="bg-white rounded-[28px] p-6 border shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1"><DollarSign size={14} /> Risco de bónus</div>
                    <p className="text-[11px] text-slate-400 font-bold mb-3">Professores com 3+ confirmações falhadas num mês arriscam o bónus de 45%.</p>
                    {atRisk.length ? atRisk.map(([name, m]) => (
                      <div key={name} className="py-2 border-b last:border-0">
                        <p className="font-black text-sm text-slate-800">{name}</p>
                        <div className="flex gap-1 flex-wrap mt-1">{Object.entries(m).filter(([, c]) => c >= 3).map(([ym, c]) => <span key={ym} className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-50 text-red-600 uppercase">{fmtMonthPt(ym)}: {c}x</span>)}</div>
                      </div>
                    )) : <div className="text-center py-4 text-emerald-600 font-bold text-sm"><CheckCircle2 size={18} className="mx-auto mb-1" />Nenhum professor em risco.</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── PEDIDOS (Tuners + Assistente) ── */}
        {tab === "pedidos" && (
          <div className="space-y-4 text-left">
            <div className="bg-white rounded-[28px] p-6 border shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><UserCheck size={14} /> Exames orais (Tuners)</div>
              {examReqs.length ? <div className="divide-y">{examReqs.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="font-black text-slate-800 text-sm truncate">{r.absentName || r.teacherName} → {r.subName || "—"}</p><p className="text-[11px] font-bold text-slate-400">{fmtDatePt(r.date)} · {r.time} · {r.book} · {r.students} alunos {r.tunerName ? `· Tuner: ${r.tunerName}` : "· por assumir"}</p></div>
                  <button onClick={async () => window.confirm("Apagar este pedido?") && (await onDeleteTunerRequest("exam", r.id))} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
                </div>
              ))}</div> : <div className="text-center py-4 text-slate-400 font-bold text-sm">Sem exames orais.</div>}
            </div>

            <div className="bg-white rounded-[28px] p-6 border shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><Repeat size={14} /> Recuperações (Tuners)</div>
              {recoveryReqs.length ? <div className="divide-y">{recoveryReqs.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="font-black text-slate-800 text-sm truncate">{r.teacherName}</p><p className="text-[11px] font-bold text-slate-400">{fmtDatePt(r.date)} · {r.lessons} aula(s) · {r.students} alunos · {r.book} {r.tunerName ? `· Tuner: ${r.tunerName}` : "· por assumir"}</p></div>
                  <button onClick={async () => window.confirm("Apagar este pedido?") && (await onDeleteTunerRequest("recovery", r.id))} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
                </div>
              ))}</div> : <div className="text-center py-4 text-slate-400 font-bold text-sm">Sem recuperações.</div>}
            </div>

            <div className="bg-white rounded-[28px] p-6 border shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><ListChecks size={14} /> Exames físicos (Assistente)</div>
              {physExams.length ? <div className="divide-y">{physExams.slice().sort((a, b) => (b.examDate || "").localeCompare(a.examDate || "")).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="font-black text-slate-800 text-sm truncate">{r.teacherName} · {r.school}</p><p className="text-[11px] font-bold text-slate-400">{fmtDatePt(r.examDate)} · {r.time} · Livro {r.book} {r.half} · Sala {r.room} · {r.students} alunos {r.done ? "· tratado" : "· pendente"}</p></div>
                  <button onClick={async () => window.confirm("Apagar este pedido?") && (await onDeleteAssistantRequest("exam", r.id))} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
                </div>
              ))}</div> : <div className="text-center py-4 text-slate-400 font-bold text-sm">Sem exames físicos.</div>}
            </div>

            <div className="bg-white rounded-[28px] p-6 border shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><ListChecks size={14} /> TK Exercise (Assistente)</div>
              {tkExercises.length ? <div className="divide-y">{tkExercises.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="font-black text-slate-800 text-sm truncate">{r.teacherName} · {r.school}</p><p className="text-[11px] font-bold text-slate-400">{fmtDatePt(r.date)} · Livro {r.book} · Older {r.older} · Younger {r.younger} {r.done ? "· tratado" : "· pendente"}</p></div>
                  <button onClick={async () => window.confirm("Apagar este pedido?") && (await onDeleteAssistantRequest("tk", r.id))} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
                </div>
              ))}</div> : <div className="text-center py-4 text-slate-400 font-bold text-sm">Sem TK Exercise.</div>}
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
// SUBSTITUTIONS  —  teacher-facing (Pedir / Confirmar / Quadro)
// ═══════════════════════════════════════════════════════════════════════════════
const Substitutions = ({ actingTeacher, teachers, subs, classes = [], lessonPlans = [], logs = [], onSubmitSub, onConfirmSub, notify, onBack }) => {
  const [tab, setTab] = useState("request");
  const [form, setForm] = useState({
    classId: "", date: getTodayStr(), time: "", room: "", book: "", page: "",
    lessontype: "", lessonnotes: "", subTeacherId: "", reason: "",
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [agreed, setAgreed] = useState({});

  const meId = actingTeacher?.id;
  const meName = actingTeacher?.name || "";
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const myClasses = classes.filter((c) => c.teacherId === meId && c.active !== false);
  const pickClass = (cid) => {
    const cls = classes.find((c) => c.id === cid);
    if (!cls) { setForm((p) => ({ ...p, classId: "" })); return; }
    const prog = calculateProgress(cls.id, logs, lessonPlans, cls);
    const planName = lessonPlans.find((p) => p.id === cls.lessonPlanId)?.name || "";
    setForm((p) => ({ ...p, classId: cid, room: cls.room || "", book: planName, page: prog.lastEndPage ? String(prog.lastEndPage) : "" }));
  };

  const myPending = subs.filter((r) => r.subTeacherId === meId && !r.confirmed);
  const [weekStart, weekEnd] = subWeekRange();
  const td = getTodayStr();

  const submit = async () => {
    setFormError("");
    const { date, time, room, book, page, lessontype, lessonnotes, subTeacherId, reason } = form;
    if (!date || !time || !room || !book || !page || !lessontype || !lessonnotes || !subTeacherId || !reason) {
      setFormError("Preencha todos os campos obrigatórios."); return;
    }
    if (!twoHoursOk(date, time)) { setFormError("Tem de ser pelo menos 2 horas antes da hora da aula."); return; }
    const dup = subs.find((r) => r.absentTeacherId === meId && r.date === date && r.time === time);
    if (dup) { setFormError(`Já existe um pedido seu para ${fmtDatePt(date)} às ${time} (substituto: ${dup.subName}).`); return; }
    const subName = teachers.find((t) => t.id === subTeacherId)?.name || "";
    setSubmitting(true);
    try {
      await onSubmitSub({
        absentTeacherId: meId, absentName: meName,
        subTeacherId, subName,
        classId: form.classId || "", className: classes.find((c) => c.id === form.classId)?.name || "",
        date, time, room, book, page, lessontype, lessonnotes, reason,
        submittedByTeacherId: meId,
      });
      setForm({ classId: "", date: getTodayStr(), time: "", room: "", book: "", page: "", lessontype: "", lessonnotes: "", subTeacherId: "", reason: "" });
      notify(`Pedido enviado. ${subName} foi avisado(a).`);
      setTab("board");
    } catch (e) {
      setFormError("Erro ao enviar: " + (e?.message || e));
    } finally { setSubmitting(false); }
  };

  const confirm = async (r) => {
    if (!agreed[r.id]) { notify("Confirme primeiro o compromisso de pontualidade."); return; }
    try { await onConfirmSub(r.id); notify("Confirmado. Seja pontual!"); }
    catch (e) { notify("Erro: " + (e?.message || e)); }
  };

  const inputCls = "w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 outline-none font-bold text-sm focus:border-indigo-400";
  const labelCls = "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block";

  const SubCard = (r) => (
    <div key={r.id} className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-black text-xs shrink-0">{subInitials(r.subName)}</div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-800 leading-none">{r.subName}</p>
          <p className="text-[11px] font-bold text-slate-400 mt-1">cobre {r.absentName} · {fmtDatePt(r.date)} às {r.time} · {r.room}</p>
        </div>
        <span className="px-2 py-1 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 uppercase">Pendente</span>
      </div>
      <p className="text-[12px] text-slate-500 font-bold mt-3 pl-1">{r.book} · pág. {r.page} · {r.lessontype}<br /><span className="italic text-slate-400 font-medium">{r.lessonnotes}</span></p>
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mt-3 flex gap-2 text-[12px] text-amber-800 font-bold leading-relaxed">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <span><strong>A pontualidade é obrigatória.</strong> Tem de chegar a horas — nem um minuto atrasado. Chegar atrasado 3 vezes num mês significa perder o bónus de 45% desse mês.</span>
      </div>
      <label className="flex items-start gap-2 mt-3 text-[12px] font-bold text-slate-600 cursor-pointer">
        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-emerald-600" checked={!!agreed[r.id]}
          onChange={(e) => setAgreed((p) => ({ ...p, [r.id]: e.target.checked }))} />
        Li e compreendi a regra de pontualidade. Comprometo-me a chegar a horas.
      </label>
      <button onClick={() => confirm(r)}
        className="w-full mt-3 p-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 flex items-center justify-center gap-2">
        <CheckCircle2 size={16} /> Confirmo que vou cobrir esta aula
      </button>
    </div>
  );

  const BoardRow = (r) => (
    <div key={r.id} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${r.confirmed ? "bg-indigo-50 text-indigo-600" : "bg-amber-100 text-amber-700"}`}>{subInitials(r.subName)}</div>
      <div className="flex-1 min-w-0">
        <p className="font-black text-slate-800 text-sm leading-none truncate">{r.subName} <span className="font-medium text-slate-400">→ {r.absentName}</span></p>
        <p className="text-[11px] font-bold text-slate-400 mt-1 truncate">{r.time} · {r.room} · {r.book} · p.{r.page} · {r.lessontype}</p>
      </div>
      <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase border ${r.confirmed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{r.confirmed ? "Confirmado" : "Pendente"}</span>
    </div>
  );

  const todayList = subs.filter((r) => r.date === td).sort((a, b) => a.time.localeCompare(b.time));
  const weekList = subs.filter((r) => r.date > td && r.date <= weekEnd).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const searchList = subs.filter((r) => !r.confirmed && r.subTeacherId !== meId &&
    (!search.trim() || r.subName?.toLowerCase().includes(search.toLowerCase()) || r.absentName?.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-left animate-in fade-in duration-300">
      <header className="bg-white px-6 py-6 rounded-b-[40px] shadow-sm mb-4 border-b">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 bg-slate-100 rounded-full active:scale-90" title="Voltar"><ArrowLeft size={20} /></button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-900 leading-none flex items-center gap-2"><Repeat size={22} className="text-indigo-600" /> Substituições</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{meName}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          {[["request", "Pedir", <Edit3 size={14} key="i" />], ["confirm", "Confirmar", <CheckCircle2 size={14} key="i" />], ["board", "Quadro", <Users size={14} key="i" />]].map(([k, label, icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${tab === k ? "bg-slate-900 text-white shadow" : "bg-slate-100 text-slate-500"}`}>
              {icon} {label}
              {k === "confirm" && myPending.length > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{myPending.length}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="px-6 space-y-4">
        {tab === "request" && (
          <>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400"><UserX size={14} /> Professor ausente</div>
              <div><span className={labelCls}>Você (ausente)</span><input className={inputCls + " bg-slate-100"} value={meName} readOnly /></div>
              <div>
                <span className={labelCls}>Turma</span>
                <select className={inputCls} value={form.classId} onChange={(e) => pickClass(e.target.value)}>
                  <option value="">Escolher a minha turma…</option>
                  {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-[10px] font-bold text-indigo-500 mt-1">Escolhe a turma e a sala, o livro e a última página preenchem-se sozinhos.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Data *</span><input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
                <div><span className={labelCls}>Hora da aula *</span>
                  <select className={inputCls} value={form.time} onChange={(e) => set("time", e.target.value)}>
                    <option value="">Selecionar</option>{SUB_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div><span className={labelCls}>Sala *</span><input className={inputCls} placeholder="ex.: Sala 3" value={form.room} onChange={(e) => set("room", e.target.value)} /></div>
            </div>

            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400"><BookOpen size={14} /> Detalhes da aula</div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Livro / plano *</span>
                  <input className={inputCls} placeholder="ex.: DM Book 2" value={form.book} onChange={(e) => set("book", e.target.value)} />
                </div>
                <div><span className={labelCls}>Última página *</span><input type="number" min="1" className={inputCls} placeholder="ex.: 42" value={form.page} onChange={(e) => set("page", e.target.value)} /></div>
              </div>
              <div><span className={labelCls}>Tipo de aula *</span>
                <select className={inputCls} value={form.lessontype} onChange={(e) => set("lessontype", e.target.value)}>
                  <option value="">Selecionar tipo</option>{SUB_LESSON_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><span className={labelCls}>Notas para o substituto *</span><textarea className={inputCls + " min-h-[70px]"} placeholder="O que o substituto precisa de saber..." value={form.lessonnotes} onChange={(e) => set("lessonnotes", e.target.value)} /></div>
            </div>

            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400"><UserCheck size={14} /> Substituto & motivo</div>
              <div><span className={labelCls}>Colega que aceitou cobrir *</span>
                <select className={inputCls} value={form.subTeacherId} onChange={(e) => set("subTeacherId", e.target.value)}>
                  <option value="">Selecionar colega</option>
                  {teachers.filter((t) => t.id !== meId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div><span className={labelCls}>Motivo da ausência *</span>
                <select className={inputCls} value={form.reason} onChange={(e) => set("reason", e.target.value)}>
                  <option value="">Selecionar motivo</option>{SUB_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {formError && <p className="text-red-500 text-sm font-bold">{formError}</p>}
              <button onClick={submit} disabled={submitting}
                className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar pedido de substituição
              </button>
            </div>
          </>
        )}

        {tab === "confirm" && (
          <>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><Bell size={14} /> As suas substituições pendentes</div>
              {myPending.length ? <div className="space-y-3">{myPending.sort((a, b) => a.date.localeCompare(b.date)).map(SubCard)}</div>
                : <div className="text-center py-6 text-slate-400 font-bold text-sm"><CheckCircle2 size={22} className="mx-auto mb-2 text-emerald-500" />Nenhuma substituição pendente para si.</div>}
            </div>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><Search size={14} /> Procurar todas as pendentes</div>
              <input className={inputCls + " mb-3"} placeholder="Procurar por nome do substituto..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {searchList.length ? <div className="space-y-3">{searchList.sort((a, b) => a.date.localeCompare(b.date)).map(SubCard)}</div>
                : <div className="text-center py-6 text-slate-400 font-bold text-sm">Nenhuma outra substituição pendente.</div>}
            </div>
          </>
        )}

        {tab === "board" && (
          <>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2"><Calendar size={14} /> Hoje</div>
              {todayList.length ? todayList.map(BoardRow) : <div className="text-center py-6 text-slate-400 font-bold text-sm">Sem substituições hoje.</div>}
            </div>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2"><Calendar size={14} /> Esta semana</div>
              {weekList.length ? weekList.map(BoardRow) : <div className="text-center py-6 text-slate-400 font-bold text-sm">Nada agendado para esta semana.</div>}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TUNERS  —  teacher-facing (pedir exame oral / recuperação)
// ═══════════════════════════════════════════════════════════════════════════════
const Tuners = ({ actingTeacher, examReqs, recoveryReqs, onAddTunerRequest, notify, onBack }) => {
  const [tab, setTab] = useState("exam");
  const [exam, setExam] = useState({ date: getTodayStr(), time: "", students: "", book: "" });
  const [rec, setRec] = useState({ date: getTodayStr(), lessons: "", students: "", book: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const meId = actingTeacher?.id;
  const meName = actingTeacher?.name || "";

  const inputCls = "w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 outline-none font-bold text-sm focus:border-indigo-400";
  const labelCls = "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block";

  const submitExam = async () => {
    setErr("");
    if (!exam.date || !exam.time || !exam.students || !exam.book) { setErr("Preencha todos os campos."); return; }
    setBusy(true);
    try {
      await onAddTunerRequest("exam", { teacherId: meId, teacherName: meName, date: exam.date, time: exam.time, students: exam.students, book: exam.book });
      setExam({ date: getTodayStr(), time: "", students: "", book: "" });
      notify("Pedido de exame enviado.");
    } catch (e) { setErr("Erro: " + (e?.message || e)); } finally { setBusy(false); }
  };
  const submitRec = async () => {
    setErr("");
    if (!rec.date || !rec.lessons || !rec.students || !rec.book) { setErr("Preencha todos os campos."); return; }
    setBusy(true);
    try {
      await onAddTunerRequest("recovery", { teacherId: meId, teacherName: meName, date: rec.date, lessons: rec.lessons, students: rec.students, book: rec.book });
      setRec({ date: getTodayStr(), lessons: "", students: "", book: "" });
      notify("Pedido de recuperação enviado.");
    } catch (e) { setErr("Erro: " + (e?.message || e)); } finally { setBusy(false); }
  };

  const myExams = examReqs.filter((r) => r.teacherId === meId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const myRecs = recoveryReqs.filter((r) => r.teacherId === meId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const statusChip = (r) => r.tunerId
    ? <span className="px-2 py-1 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">Tuner: {r.tunerName}</span>
    : <span className="px-2 py-1 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 uppercase">À espera de tuner</span>;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-left animate-in fade-in duration-300">
      <header className="bg-white px-6 py-6 rounded-b-[40px] shadow-sm mb-4 border-b">
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="p-2 bg-slate-100 rounded-full active:scale-90" title="Voltar"><ArrowLeft size={20} /></button>}
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-900 leading-none flex items-center gap-2"><UserCheck size={22} className="text-indigo-600" /> Tuners</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pedir exame oral ou recuperação</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          {[["exam", "Exame Oral"], ["recovery", "Recuperação"]].map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setErr(""); }}
              className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${tab === k ? "bg-slate-900 text-white shadow" : "bg-slate-100 text-slate-500"}`}>{label}</button>
          ))}
        </div>
      </header>

      <main className="px-6 space-y-4">
        {tab === "exam" && (
          <>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400"><Edit3 size={14} /> Novo pedido de exame oral</div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Data *</span><input type="date" className={inputCls} value={exam.date} onChange={(e) => setExam((p) => ({ ...p, date: e.target.value }))} /></div>
                <div><span className={labelCls}>Hora *</span>
                  <select className={inputCls} value={exam.time} onChange={(e) => setExam((p) => ({ ...p, time: e.target.value }))}>
                    <option value="">Selecionar</option>{SUB_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Nº de alunos *</span><input type="number" min="1" className={inputCls} placeholder="ex.: 20" value={exam.students} onChange={(e) => setExam((p) => ({ ...p, students: e.target.value }))} /></div>
                <div><span className={labelCls}>Livro *</span>
                  <select className={inputCls} value={exam.book} onChange={(e) => setExam((p) => ({ ...p, book: e.target.value }))}>
                    <option value="">Selecionar</option>{SUB_BOOKS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select></div>
              </div>
              {err && <p className="text-red-500 text-sm font-bold">{err}</p>}
              <button onClick={submitExam} disabled={busy} className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Pedir exame
              </button>
            </div>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><ListChecks size={14} /> Os meus pedidos de exame</div>
              {myExams.length ? <div className="divide-y">{myExams.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div><p className="font-black text-slate-800 text-sm">{fmtDatePt(r.date)} · {r.time}</p><p className="text-[11px] font-bold text-slate-400">{r.students} alunos · {r.book}</p></div>
                  {statusChip(r)}
                </div>
              ))}</div> : <div className="text-center py-6 text-slate-400 font-bold text-sm">Ainda não pediu exames.</div>}
            </div>
          </>
        )}

        {tab === "recovery" && (
          <>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400"><Edit3 size={14} /> Novo pedido de recuperação</div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Data *</span><input type="date" className={inputCls} value={rec.date} onChange={(e) => setRec((p) => ({ ...p, date: e.target.value }))} /></div>
                <div><span className={labelCls}>Nº de aulas *</span><input type="number" min="1" className={inputCls} placeholder="ex.: 3" value={rec.lessons} onChange={(e) => setRec((p) => ({ ...p, lessons: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Nº de alunos *</span><input type="number" min="1" className={inputCls} placeholder="ex.: 5" value={rec.students} onChange={(e) => setRec((p) => ({ ...p, students: e.target.value }))} /></div>
                <div><span className={labelCls}>Livro *</span>
                  <select className={inputCls} value={rec.book} onChange={(e) => setRec((p) => ({ ...p, book: e.target.value }))}>
                    <option value="">Selecionar</option>{SUB_BOOKS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select></div>
              </div>
              {err && <p className="text-red-500 text-sm font-bold">{err}</p>}
              <button onClick={submitRec} disabled={busy} className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Pedir recuperação
              </button>
            </div>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><ListChecks size={14} /> Os meus pedidos de recuperação</div>
              {myRecs.length ? <div className="divide-y">{myRecs.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div><p className="font-black text-slate-800 text-sm">{fmtDatePt(r.date)}</p><p className="text-[11px] font-bold text-slate-400">{r.lessons} aula(s) · {r.students} alunos · {r.book}</p></div>
                  {statusChip(r)}
                </div>
              ))}</div> : <div className="text-center py-6 text-slate-400 font-bold text-sm">Ainda não pediu recuperações.</div>}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TUNER DEPARTMENT  —  tuner-facing (ver todos os pedidos, assumir, formulários)
// ═══════════════════════════════════════════════════════════════════════════════
const TunerDepartment = ({ actingTeacher, examReqs, recoveryReqs, onClaimTunerRequest, onDeleteTunerRequest, notify, onBack }) => {
  const [tab, setTab] = useState("exam");
  const meId = actingTeacher?.id;
  const meName = actingTeacher?.name || "";
  const claim = async (kind, r) => { try { await onClaimTunerRequest(kind, r.id, meId, meName); notify("Assumiu o pedido de " + r.teacherName + "."); } catch (e) { notify("Erro: " + (e?.message || e)); } };
  const del = async (kind, r) => { if (window.confirm("Remover este pedido?")) await onDeleteTunerRequest(kind, r.id); };

  const exams = [...examReqs].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "").localeCompare(b.time || ""));
  const recs = [...recoveryReqs].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const openExams = exams.filter((r) => !r.tunerId).length;
  const openRecs = recs.filter((r) => !r.tunerId).length;

  const claimCell = (kind, r) => r.tunerId
    ? <span className="font-black text-emerald-600 text-[12px]">{r.tunerName}</span>
    : <button onClick={() => claim(kind, r)} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest active:scale-95">Assumir</button>;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-left animate-in fade-in duration-300">
      <header className="bg-white px-6 py-6 rounded-b-[40px] shadow-sm mb-4 border-b">
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="p-2 bg-slate-100 rounded-full active:scale-90" title="Voltar"><ArrowLeft size={20} /></button>}
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-900 leading-none flex items-center gap-2"><ShieldCheck size={22} className="text-indigo-600" /> Tuner Department</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Todos os pedidos de exame e recuperação</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button onClick={() => openExternalUrl(TUNER_WEEKLY_PLAN_URL)} className="p-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 flex items-center justify-center gap-2"><Calendar size={14} /> Weekly plan</button>
          <button onClick={() => openExternalUrl(TUNER_OBSERVATION_URL)} className="p-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 flex items-center justify-center gap-2"><ListChecks size={14} /> Observation report</button>
        </div>
        <div className="flex gap-2 mt-4">
          {[["exam", "Exames", openExams], ["recovery", "Recuperações", openRecs]].map(([k, label, count]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${tab === k ? "bg-indigo-600 text-white shadow" : "bg-slate-100 text-slate-500"}`}>
              {label}{count > 0 && <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{count}</span>}
            </button>
          ))}
        </div>
      </header>

      <main className="px-6">
        <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-x-auto">
          {tab === "exam" && (
            <table className="w-full text-left text-sm min-w-[560px]">
              <thead><tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b">
                <th className="p-4">Teacher</th><th className="p-4">Time</th><th className="p-4">Students</th><th className="p-4">Book</th><th className="p-4">Date</th><th className="p-4">Tuner</th><th className="p-4"></th>
              </tr></thead>
              <tbody>
                {exams.length ? exams.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-4 font-black text-slate-800">{r.teacherName}</td>
                    <td className="p-4 font-bold text-slate-600">{r.time}</td>
                    <td className="p-4 font-bold text-slate-600">{r.students}</td>
                    <td className="p-4 font-bold text-slate-600">{r.book}</td>
                    <td className="p-4 font-bold text-slate-600">{fmtDatePt(r.date)}</td>
                    <td className="p-4">{claimCell("exam", r)}</td>
                    <td className="p-4"><button onClick={() => del("exam", r)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button></td>
                  </tr>
                )) : <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">Sem pedidos de exame.</td></tr>}
              </tbody>
            </table>
          )}
          {tab === "recovery" && (
            <table className="w-full text-left text-sm min-w-[560px]">
              <thead><tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b">
                <th className="p-4">Teacher</th><th className="p-4">Aulas</th><th className="p-4">Students</th><th className="p-4">Book</th><th className="p-4">Date</th><th className="p-4">Tuner</th><th className="p-4"></th>
              </tr></thead>
              <tbody>
                {recs.length ? recs.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-4 font-black text-slate-800">{r.teacherName}</td>
                    <td className="p-4 font-bold text-slate-600">{r.lessons}</td>
                    <td className="p-4 font-bold text-slate-600">{r.students}</td>
                    <td className="p-4 font-bold text-slate-600">{r.book}</td>
                    <td className="p-4 font-bold text-slate-600">{fmtDatePt(r.date)}</td>
                    <td className="p-4">{claimCell("recovery", r)}</td>
                    <td className="p-4"><button onClick={() => del("recovery", r)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button></td>
                  </tr>
                )) : <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">Sem pedidos de recuperação.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ASSISTANT REQUESTS  —  teacher-facing (exame físico + TK exercise)
// ═══════════════════════════════════════════════════════════════════════════════
const AssistantRequests = ({ actingTeacher, schools = [], physExams, tkExercises, onAddAssistantRequest, notify, onBack }) => {
  const tkAllowed = schools.some((s) => TK_SCHOOLS.includes(s));
  const [tab, setTab] = useState("exam");
  const [exam, setExam] = useState({ school: schools[0] || "", book: "", half: BOOK_HALVES[0], room: "", students: "", examDate: getTodayStr(), time: "", round: EXAM_ROUNDS[0] });
  const [tk, setTk] = useState({ school: schools.find((s) => TK_SCHOOLS.includes(s)) || "", book: "", older: "", younger: "", date: getTodayStr(), note: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const meId = actingTeacher?.id, meName = actingTeacher?.name || "";
  const inputCls = "w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 outline-none font-bold text-sm focus:border-indigo-400";
  const labelCls = "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block";

  const SchoolField = ({ value, onChange, allowed }) => (
    <div><span className={labelCls}>Escola *</span>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecionar</option>
        {(allowed || schools).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );

  const submitExam = async () => {
    setErr("");
    const { school, book, half, room, students, examDate, time, round } = exam;
    if (!school || !book || !room || !students || !examDate || !time || !round) { setErr("Preencha todos os campos."); return; }
    setBusy(true);
    try {
      await onAddAssistantRequest("exam", { teacherId: meId, teacherName: meName, school, book, half, room, students, examDate, time, round, requestDate: getTodayStr() });
      setExam({ school: schools[0] || "", book: "", half: BOOK_HALVES[0], room: "", students: "", examDate: getTodayStr(), time: "", round: EXAM_ROUNDS[0] });
      notify("Pedido de exame físico enviado.");
    } catch (e) { setErr("Erro: " + (e?.message || e)); } finally { setBusy(false); }
  };
  const submitTk = async () => {
    setErr("");
    const { school, book, older, younger, date } = tk;
    if (!school || !book || (!older && !younger) || !date) { setErr("Preencha os campos (pelo menos uma quantidade)."); return; }
    setBusy(true);
    try {
      await onAddAssistantRequest("tk", { teacherId: meId, teacherName: meName, school, book, older: older || "0", younger: younger || "0", date, note: tk.note || "" });
      setTk({ school: schools.find((s) => TK_SCHOOLS.includes(s)) || "", book: "", older: "", younger: "", date: getTodayStr(), note: "" });
      notify("Pedido de TK Exercise enviado.");
    } catch (e) { setErr("Erro: " + (e?.message || e)); } finally { setBusy(false); }
  };

  const myExams = physExams.filter((r) => r.teacherId === meId).sort((a, b) => (b.examDate || "").localeCompare(a.examDate || ""));
  const myTk = tkExercises.filter((r) => r.teacherId === meId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const doneChip = (r) => r.done
    ? <span className="px-2 py-1 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">Tratado</span>
    : <span className="px-2 py-1 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 uppercase">Pendente</span>;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-left animate-in fade-in duration-300">
      <header className="bg-white px-6 py-6 rounded-b-[40px] shadow-sm mb-4 border-b">
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="p-2 bg-slate-100 rounded-full active:scale-90" title="Voltar"><ArrowLeft size={20} /></button>}
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-900 leading-none flex items-center gap-2"><ListChecks size={22} className="text-indigo-600" /> Assistente</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pedir exame físico ou TK Exercise</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={() => { setTab("exam"); setErr(""); }} className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest ${tab === "exam" ? "bg-slate-900 text-white shadow" : "bg-slate-100 text-slate-500"}`}>Exame físico</button>
          {tkAllowed && <button onClick={() => { setTab("tk"); setErr(""); }} className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest ${tab === "tk" ? "bg-slate-900 text-white shadow" : "bg-slate-100 text-slate-500"}`}>TK Exercise</button>}
        </div>
      </header>

      <main className="px-6 space-y-4">
        {!schools.length && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm font-bold text-amber-700">A sua conta não tem escola definida. Peça ao administrador para a atribuir.</div>}
        {tab === "exam" && (
          <>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400"><Edit3 size={14} /> Novo pedido de exame físico</div>
              {schools.length > 1 && <SchoolField value={exam.school} onChange={(v) => setExam((p) => ({ ...p, school: v }))} />}
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Livro *</span><input className={inputCls} placeholder="ex.: 12" value={exam.book} onChange={(e) => setExam((p) => ({ ...p, book: e.target.value }))} /></div>
                <div><span className={labelCls}>Metade</span>
                  <select className={inputCls} value={exam.half} onChange={(e) => setExam((p) => ({ ...p, half: e.target.value }))}>{BOOK_HALVES.map((h) => <option key={h} value={h}>{h}</option>)}</select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Sala *</span><input className={inputCls} placeholder="ex.: A" value={exam.room} onChange={(e) => setExam((p) => ({ ...p, room: e.target.value }))} /></div>
                <div><span className={labelCls}>Nº alunos *</span><input type="number" min="1" className={inputCls} placeholder="ex.: 10" value={exam.students} onChange={(e) => setExam((p) => ({ ...p, students: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Data do exame *</span><input type="date" className={inputCls} value={exam.examDate} onChange={(e) => setExam((p) => ({ ...p, examDate: e.target.value }))} /></div>
                <div><span className={labelCls}>Hora *</span>
                  <select className={inputCls} value={exam.time} onChange={(e) => setExam((p) => ({ ...p, time: e.target.value }))}>
                    <option value="">Selecionar</option>{SUB_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></div>
              </div>
              <div><span className={labelCls}>Round *</span>
                <select className={inputCls} value={exam.round} onChange={(e) => setExam((p) => ({ ...p, round: e.target.value }))}>{EXAM_ROUNDS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
              </div>
              {err && <p className="text-red-500 text-sm font-bold">{err}</p>}
              <button onClick={submitExam} disabled={busy || !schools.length} className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Pedir exame
              </button>
            </div>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><ListChecks size={14} /> Os meus exames físicos</div>
              {myExams.length ? <div className="divide-y">{myExams.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div><p className="font-black text-slate-800 text-sm">{fmtDatePt(r.examDate)} · {r.time} · {r.school}</p><p className="text-[11px] font-bold text-slate-400">Livro {r.book} {r.half} · Sala {r.room} · {r.students} alunos · Round {r.round}</p></div>
                  {doneChip(r)}
                </div>
              ))}</div> : <div className="text-center py-6 text-slate-400 font-bold text-sm">Sem pedidos de exame físico.</div>}
            </div>
          </>
        )}

        {tab === "tk" && tkAllowed && (
          <>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400"><Edit3 size={14} /> Novo pedido de TK Exercise</div>
              {schools.filter((s) => TK_SCHOOLS.includes(s)).length > 1 && <SchoolField value={tk.school} onChange={(v) => setTk((p) => ({ ...p, school: v }))} allowed={schools.filter((s) => TK_SCHOOLS.includes(s))} />}
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Livro *</span><input className={inputCls} placeholder="ex.: 1" value={tk.book} onChange={(e) => setTk((p) => ({ ...p, book: e.target.value }))} /></div>
                <div><span className={labelCls}>Data *</span><input type="date" className={inputCls} value={tk.date} onChange={(e) => setTk((p) => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={labelCls}>Qtd Older *</span><input type="number" min="0" className={inputCls} placeholder="ex.: 10" value={tk.older} onChange={(e) => setTk((p) => ({ ...p, older: e.target.value }))} /></div>
                <div><span className={labelCls}>Qtd Younger *</span><input type="number" min="0" className={inputCls} placeholder="ex.: 4" value={tk.younger} onChange={(e) => setTk((p) => ({ ...p, younger: e.target.value }))} /></div>
              </div>
              <div><span className={labelCls}>Nota</span><input className={inputCls} placeholder="opcional" value={tk.note} onChange={(e) => setTk((p) => ({ ...p, note: e.target.value }))} /></div>
              {err && <p className="text-red-500 text-sm font-bold">{err}</p>}
              <button onClick={submitTk} disabled={busy} className="w-full p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Pedir TK Exercise
              </button>
            </div>
            <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3"><ListChecks size={14} /> Os meus TK Exercise</div>
              {myTk.length ? <div className="divide-y">{myTk.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div><p className="font-black text-slate-800 text-sm">{fmtDatePt(r.date)} · Livro {r.book} · {r.school}</p><p className="text-[11px] font-bold text-slate-400">Older {r.older} · Younger {r.younger}{r.note ? ` · ${r.note}` : ""}</p></div>
                  {doneChip(r)}
                </div>
              ))}</div> : <div className="text-center py-6 text-slate-400 font-bold text-sm">Sem pedidos de TK Exercise.</div>}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ASSISTANT DEPARTMENT  —  assistant-facing (vê pedidos da sua escola)
// ═══════════════════════════════════════════════════════════════════════════════
const AssistantDepartment = ({ actingTeacher, schools = [], physExams, tkExercises, onUpdateAssistantRequest, onDeleteAssistantRequest, notify, onBack }) => {
  const [tab, setTab] = useState("exam");
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ replacement: "", version: "", givenBy: "", obs: "" });
  const exams = physExams.filter((r) => schools.includes(r.school)).sort((a, b) => (a.examDate || "").localeCompare(b.examDate || ""));
  const tks = tkExercises.filter((r) => schools.includes(r.school)).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const openExams = exams.filter((r) => !r.done).length;
  const openTk = tks.filter((r) => !r.done).length;

  const startEdit = (r) => { setEditId(r.id); setEdit({ replacement: r.replacement || "", version: r.version || "", givenBy: r.givenBy || "", obs: r.obs || "" }); };
  const saveEdit = async (r) => { await onUpdateAssistantRequest("exam", r.id, { ...edit, done: true }); setEditId(null); notify("Exame atualizado."); };
  const toggleTkDone = async (r) => { await onUpdateAssistantRequest("tk", r.id, { done: !r.done }); };
  const delReq = async (kind, r) => { if (window.confirm("Remover este pedido?")) await onDeleteAssistantRequest(kind, r.id); };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-left animate-in fade-in duration-300">
      <header className="bg-white px-6 py-6 rounded-b-[40px] shadow-sm mb-4 border-b">
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="p-2 bg-slate-100 rounded-full active:scale-90" title="Voltar"><ArrowLeft size={20} /></button>}
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-900 leading-none flex items-center gap-2"><ShieldCheck size={22} className="text-indigo-600" /> Assistente</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Exames físicos e TK Exercise · {schools.join(" / ") || "sem escola"}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          {[["exam", "Exames físicos", openExams], ["tk", "TK Exercise", openTk]].map(([k, label, count]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-1.5 ${tab === k ? "bg-indigo-600 text-white shadow" : "bg-slate-100 text-slate-500"}`}>
              {label}{count > 0 && <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{count}</span>}
            </button>
          ))}
        </div>
      </header>

      <main className="px-6 space-y-3">
        {tab === "exam" && (exams.length ? exams.map((r) => (
          <div key={r.id} className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-black text-slate-800">{r.teacherName} <span className="text-slate-400 font-bold">· {r.school}</span></p>
                <p className="text-[12px] font-bold text-slate-500 mt-1">{fmtDatePt(r.examDate)} · {r.time} · Livro {r.book} {r.half} · Sala {r.room} · {r.students} alunos · Round {r.round}</p>
                {(r.version || r.givenBy || r.replacement) && <p className="text-[11px] text-slate-400 mt-1">{r.replacement ? `Substituição: ${r.replacement} · ` : ""}{r.version ? `Versão ${r.version} · ` : ""}{r.givenBy ? `Entregue por ${r.givenBy}` : ""}{r.obs ? ` · ${r.obs}` : ""}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase border ${r.done ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{r.done ? "Tratado" : "Pendente"}</span>
                <button onClick={() => (editId === r.id ? setEditId(null) : startEdit(r))} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase">{r.done ? "Editar" : "Tratar"}</button>
                <button onClick={() => delReq("exam", r)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            </div>
            {editId === r.id && (
              <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50 rounded-2xl p-3 border">
                <input className="p-2 bg-white border rounded-lg text-sm font-bold col-span-2" placeholder="Substituição (Prof / Livro-metade / Sala)" value={edit.replacement} onChange={(e) => setEdit((p) => ({ ...p, replacement: e.target.value }))} />
                <input className="p-2 bg-white border rounded-lg text-sm font-bold" placeholder="Versão (A/B)" value={edit.version} onChange={(e) => setEdit((p) => ({ ...p, version: e.target.value }))} />
                <input className="p-2 bg-white border rounded-lg text-sm font-bold" placeholder="Entregue por" value={edit.givenBy} onChange={(e) => setEdit((p) => ({ ...p, givenBy: e.target.value }))} />
                <input className="p-2 bg-white border rounded-lg text-sm font-bold col-span-2" placeholder="Obs" value={edit.obs} onChange={(e) => setEdit((p) => ({ ...p, obs: e.target.value }))} />
                <button onClick={() => saveEdit(r)} className="col-span-2 p-2 bg-slate-900 text-white rounded-lg font-black uppercase text-[10px] tracking-widest">Guardar e marcar tratado</button>
              </div>
            )}
          </div>
        )) : <div className="bg-white rounded-[24px] p-8 border text-center text-slate-400 font-bold">Sem exames físicos.</div>)}

        {tab === "tk" && (tks.length ? tks.map((r) => (
          <div key={r.id} className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-black text-slate-800">{r.teacherName} <span className="text-slate-400 font-bold">· {r.school}</span></p>
              <p className="text-[12px] font-bold text-slate-500 mt-1">{fmtDatePt(r.date)} · Livro {r.book} · Older {r.older} · Younger {r.younger}{r.note ? ` · ${r.note}` : ""}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleTkDone(r)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${r.done ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-indigo-600 text-white"}`}>{r.done ? "Tratado" : "Marcar tratado"}</button>
              <button onClick={() => delReq("tk", r)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
          </div>
        )) : <div className="bg-white rounded-[24px] p-8 border text-center text-slate-400 font-bold">Sem pedidos de TK Exercise.</div>)}
      </main>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR  —  navegação por papel (logo · menus · conta)
// ═══════════════════════════════════════════════════════════════════════════════
const Sidebar = ({ open, onClose, session, actingTeacher, tabletMode, view, onNavigate, onOpenAdmin, onSwitchTeacher, onLogout }) => {
  const role = session?.role;
  const items = [
    { label: "Turmas", icon: Layout, view: "teacher_home" },
    { label: "Substituições", icon: Repeat, view: "subs" },
    { label: "Tuners", icon: UserCheck, view: "tuners" },
    { label: "Assistente", icon: ListChecks, view: "assistant" },
  ];
  if (role === "tuner") items.push({ label: "Tuner Department", icon: ShieldCheck, view: "tuner_dept" });
  if (role === "assistant") items.push({ label: "Departamento Assistente", icon: ShieldCheck, view: "assistant_dept" });

  return (
    <>
      <div className={`fixed inset-0 bg-slate-950/50 z-40 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={onClose} />
      <aside className={`fixed inset-y-0 left-0 w-72 bg-slate-900 text-white z-50 flex flex-col transform transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Logo */}
        <div className="px-5 py-6 border-b border-slate-700/60">
          <div className="flex justify-end mb-2">
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" title="Fechar"><X size={18} /></button>
          </div>
          <div className="overflow-hidden rounded-xl shadow-sm bg-white">
            <img src={logoNancy} alt="Nancy's English School" className="w-full block scale-[1.06]" />
          </div>
        </div>
        {/* Menu */}
        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1">
          {items.map((it) => (
            <button key={it.view} onClick={() => onNavigate(it.view)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black text-sm transition-all ${view === it.view ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"}`}>
              <it.icon size={18} /> {it.label}
            </button>
          ))}
          {tabletMode && (
            <button onClick={onSwitchTeacher} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black text-sm text-slate-300 hover:bg-slate-800">
              <Users size={18} /> Trocar professor
            </button>
          )}
          {role === "admin" && (
            <button onClick={onOpenAdmin} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black text-sm text-indigo-300 hover:bg-slate-800">
              <ShieldCheck size={18} /> Direção
            </button>
          )}
        </nav>
        {/* Account */}
        <div className="px-4 py-5 border-t border-slate-700/60">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center font-black text-xs">{subInitials(actingTeacher?.name || "?")}</div>
            <div className="min-w-0"><p className="font-black text-sm truncate">{actingTeacher?.name || "—"}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{role === "admin" ? "Direção" : role === "tuner" ? "Tuner" : role === "assistant" ? "Assistente" : "Professor"}</p></div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-800 text-slate-300 hover:bg-slate-700">
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP  —  Firebase-powered data layer
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {

  // ── State ───────────────────────────────────────────────────────────────────
  const [authLoading,   setAuthLoading]   = useState(true);
  const [dataLoading,   setDataLoading]   = useState(true);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view,          setView]          = useState("login");
  const [adminTab,      setAdminTab]      = useState("classes");
  const [originView,    setOriginView]    = useState("teacher_home");
  const [teachers,      setTeachers]      = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [lessonPlans,   setLessonPlans]   = useState([]);
  const [logs,          setLogs]          = useState([]);
  const [accounts,      setAccounts]      = useState([]);
  const [subs,          setSubs]          = useState([]);
  const [examReqs,      setExamReqs]      = useState([]);
  const [recoveryReqs,  setRecoveryReqs]  = useState([]);
  const [physExams,     setPhysExams]     = useState([]);
  const [tkExercises,   setTkExercises]   = useState([]);
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
  const [signupName,    setSignupName]    = useState("");
  const [signupEmail,   setSignupEmail]   = useState("");
  const [signupPassword,setSignupPassword]= useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupSchools, setSignupSchools] = useState([]);
  const [signupError,   setSignupError]   = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const signupNameRef = useRef("");
  const signupSchoolsRef = useRef([]);
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

  // ── Firestore real-time listeners (only after auth) ─────────────────────────
  const [authedUid, setAuthedUid] = useState(null);

  useEffect(() => {
    // settings is public — always listen
    const unsubSettings = onSnapshot(doc(db, "settings", "main"), (s) => {
      if (s.exists()) {
        setAdminPinState(String(s.data().adminPin || "200503"));
        setTabletModeState(!!s.data().tabletMode);
      }
    });
    return () => unsubSettings();
  }, []);

  useEffect(() => {
    if (!authedUid) {
      setTeachers([]); setClasses([]); setLessonPlans([]); setLogs([]); setAccounts([]);
      setDataLoading(false);
      return;
    }
    let resolved = 0;
    const check = () => { if (++resolved >= 10) setDataLoading(false); };
    const timeout = setTimeout(() => setDataLoading(false), 8000);

    const unsubs = [
      onSnapshot(collection(db, "teachers"),    (s) => { setTeachers(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "classes"),     (s) => { setClasses(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "lessonPlans"), (s) => { setLessonPlans(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "logs"),        (s) => { setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "users"),       (s) => { setAccounts(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }),
      onSnapshot(collection(db, "substitutions"), (s) => { setSubs(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }, () => check()),
      onSnapshot(collection(db, "examRequests"), (s) => { setExamReqs(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }, () => check()),
      onSnapshot(collection(db, "recoveryRequests"), (s) => { setRecoveryReqs(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }, () => check()),
      onSnapshot(collection(db, "physExamRequests"), (s) => { setPhysExams(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }, () => check()),
      onSnapshot(collection(db, "tkExerciseRequests"), (s) => { setTkExercises(s.docs.map((d) => ({ id: d.id, ...d.data() }))); check(); }, () => check()),
    ];

    seedFirestoreIfEmpty().catch(console.error);
    return () => { clearTimeout(timeout); unsubs.forEach((u) => u()); };
  }, [authedUid]);

  // ── Firebase Auth listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let profile = null;
        const byUid = await getDoc(doc(db, "users", firebaseUser.uid));
        if (byUid.exists()) {
          profile = byUid.data();
        } else {
          // Conta pré-registada por email (compatibilidade): migra para o UID.
          const q = query(collection(db, "users"), where("email", "==", firebaseUser.email));
          const res = await getDocs(q);
          if (!res.empty) {
            profile = { ...res.docs[0].data(), activated: true };
            await setDoc(doc(db, "users", firebaseUser.uid), profile);
            await deleteDoc(res.docs[0].ref);
          } else {
            // Auto-registo: cria perfil pendente à espera de aprovação do admin.
            profile = {
              email: (firebaseUser.email || "").toLowerCase(),
              name: firebaseUser.displayName || signupNameRef.current || "",
              phone: "",
              role: "teacher",
              teacherId: "",
              schools: signupSchoolsRef.current || [],
              activated: false,
              createdAt: serverTimestamp(),
            };
            await setDoc(doc(db, "users", firebaseUser.uid), profile);
          }
        }
        if (profile.activated) {
          setPendingApproval(null);
          setAuthedUid(firebaseUser.uid);
          setSession({ accountId: firebaseUser.uid, teacherId: profile.teacherId, role: profile.role || "teacher", schools: profile.schools || [] });
        } else {
          // Conta criada mas ainda não aprovada — mostra ecrã de espera.
          setAuthedUid(null);
          setSession(null);
          setPendingApproval(firebaseUser.email || "");
        }
      } else {
        setAuthedUid(null);
        setSession(null);
        setPendingApproval(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

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
    if (session && view === "login")                           { setView("teacher_home"); setOriginView("teacher_home"); return; }
    // If on teacher_home but actingTeacher not found (teacherId mismatch), go to choose_teacher
    if (session && view === "teacher_home" && !actingTeacher && teachers.length > 0) {
      setView("choose_teacher");
    }
  }, [authLoading, dataLoading, session, tabletMode, view, actingTeacher, teachers]);

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
    return await addDoc(collection(db, col), data);
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

  // ── Substitutions CRUD → Firestore ──────────────────────────────────────────
  const onSubmitSub = useCallback(async (data) => {
    await addDoc(collection(db, "substitutions"), {
      ...data,
      confirmed: false,
      confirmedAt: null,
      submittedAt: serverTimestamp(),
    });
  }, []);

  const onConfirmSub = useCallback(async (id) => {
    await updateDoc(doc(db, "substitutions", id), {
      confirmed: true,
      confirmedAt: serverTimestamp(),
    });
  }, []);

  const onDeleteSub = useCallback(async (id) => {
    await deleteDoc(doc(db, "substitutions", id));
  }, []);

  const onSetClassPlan = useCallback(async (classId, planId) => {
    await updateDoc(doc(db, "classes", classId), { lessonPlanId: planId, planStartDate: getTodayStr() });
    notify("Plano atualizado! O progresso recomeça para o novo plano.");
  }, [notify]);

  // ── Tuner requests CRUD → Firestore ─────────────────────────────────────────
  const onAddTunerRequest = useCallback(async (kind, data) => {
    const col = kind === "exam" ? "examRequests" : "recoveryRequests";
    await addDoc(collection(db, col), {
      ...data, tunerId: "", tunerName: "", createdAt: serverTimestamp(),
    });
  }, []);

  const onClaimTunerRequest = useCallback(async (kind, id, tunerId, tunerName) => {
    const col = kind === "exam" ? "examRequests" : "recoveryRequests";
    await updateDoc(doc(db, col, id), { tunerId, tunerName });
  }, []);

  const onDeleteTunerRequest = useCallback(async (kind, id) => {
    const col = kind === "exam" ? "examRequests" : "recoveryRequests";
    await deleteDoc(doc(db, col, id));
  }, []);

  // ── Assistant requests CRUD → Firestore ─────────────────────────────────────
  const onAddAssistantRequest = useCallback(async (kind, data) => {
    const col = kind === "exam" ? "physExamRequests" : "tkExerciseRequests";
    await addDoc(collection(db, col), { ...data, done: false, createdAt: serverTimestamp() });
  }, []);

  const onUpdateAssistantRequest = useCallback(async (kind, id, patch) => {
    const col = kind === "exam" ? "physExamRequests" : "tkExerciseRequests";
    await updateDoc(doc(db, col, id), patch);
  }, []);

  const onDeleteAssistantRequest = useCallback(async (kind, id) => {
    const col = kind === "exam" ? "physExamRequests" : "tkExerciseRequests";
    await deleteDoc(doc(db, col, id));
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

  const handleGoogleLogin = useCallback(async () => {
    setLoginLoading(true); setLoginError("");
    try {
      // O onAuthStateChanged trata do perfil: liga a conta ao email registado
      // pelo administrador, ou faz signOut se o email não estiver registado.
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      if (err?.code !== "auth/popup-closed-by-user" &&
          err?.code !== "auth/cancelled-popup-request") {
        setLoginError("Não foi possível entrar com o Google.");
      }
    } finally {
      setLoginLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    setActingTeacher(null);
    setSession(null);
    setView("login");
  }, []);

  const sidebarNavigate = useCallback((v) => {
    setSidebarOpen(false);
    const teacherViews = ["teacher_home", "subs", "tuners", "tuner_dept", "assistant", "assistant_dept"];
    if (teacherViews.includes(v) && !actingTeacher) {
      setView("choose_teacher");
      notify("Escolha primeiro o professor.");
      return;
    }
    if (["subs", "tuners", "tuner_dept", "assistant", "assistant_dept"].includes(v)) setOriginView("teacher_home");
    setView(v);
  }, [actingTeacher, notify]);

  const handleSignup = useCallback(async () => {
    setSignupError("");
    if (!signupName.trim()) return setSignupError("Insira o seu nome.");
    if (!signupEmail.trim()) return setSignupError("Insira o seu email.");
    if (!signupSchools.length) return setSignupError("Escolha pelo menos uma escola.");
    if (signupPassword.length < 6) return setSignupError("Senha mínimo 6 caracteres.");
    if (signupPassword !== signupConfirm) return setSignupError("As senhas não coincidem.");
    setSignupLoading(true);
    try {
      // Guarda o nome e escolas para o onAuthStateChanged os gravar no perfil pendente.
      signupNameRef.current = signupName.trim();
      signupSchoolsRef.current = signupSchools;
      // Auto-registo: cria a conta. O perfil pendente e o ecrã de espera
      // são tratados pelo onAuthStateChanged.
      await createUserWithEmailAndPassword(auth, signupEmail.trim().toLowerCase(), signupPassword);
      setSignupName(""); setSignupEmail(""); setSignupPassword(""); setSignupConfirm(""); setSignupSchools([]);
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setSignupError("Este email já tem conta. Use o separador Entrar.");
      } else {
        setSignupError(err.message || "Erro ao criar conta.");
      }
    } finally {
      setSignupLoading(false);
    }
  }, [signupName, signupEmail, signupPassword, signupConfirm, signupSchools]);

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

  // ── Pending approval view ────────────────────────────────────────────────────
  if (pendingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        {toast}
        <div className="w-full max-w-md">
          <div className="bg-white rounded-[56px] shadow-2xl p-12 border text-center space-y-6">
            <div className="mx-auto w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center shadow-inner">
              <Clock size={36} className="text-amber-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Conta criada com sucesso!</h1>
              <p className="text-slate-400 font-bold">Olá, <span className="text-slate-700 font-black">{pendingApproval}</span>!</p>
            </div>
            <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200">
              <p className="text-sm font-bold text-amber-700 leading-relaxed">
                Aguarda que o administrador aprove o teu acesso e atribua o teu cargo.
              </p>
            </div>
            <button onClick={async () => { await signOut(auth); setPendingApproval(null); setView("login"); }}
              className="mx-auto px-8 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-slate-600 flex items-center justify-center gap-3 active:scale-95 hover:border-slate-200">
              <LogOut size={18} /> Sair
            </button>
          </div>
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

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-slate-100" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">ou</span>
                  <div className="h-px flex-1 bg-slate-100" />
                </div>

                <button onClick={handleGoogleLogin} disabled={loginLoading}
                  className="w-full p-5 bg-white border-2 border-slate-100 rounded-[28px] font-black uppercase tracking-wider text-slate-700 shadow-sm active:scale-95 disabled:opacity-60 flex items-center justify-center gap-3 hover:border-slate-200">
                  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  Continuar com o Google
                </button>
              </div>
            )}

            {loginTab === "signup" && (
              <div className="space-y-4 text-left">
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <p className="text-[11px] font-bold text-indigo-700 leading-relaxed">
                    Crie a sua conta aqui. Depois é só aguardar que o administrador aprove o seu acesso e atribua o seu cargo.
                  </p>
                </div>
                <div className="relative">
                  <Type className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                  <input className="w-full bg-slate-50 p-5 pl-14 rounded-[24px] border-2 border-slate-50 outline-none font-bold"
                    placeholder="Nome completo" value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    autoComplete="name" />
                </div>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                  <input className="w-full bg-slate-50 p-5 pl-14 rounded-[24px] border-2 border-slate-50 outline-none font-bold"
                    placeholder="Email" value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    autoComplete="email" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Escola(s) onde dá aulas</p>
                  <div className="flex gap-2">
                    {SCHOOLS.map((s) => {
                      const on = signupSchools.includes(s);
                      return (
                        <button key={s} type="button"
                          onClick={() => setSignupSchools((p) => on ? p.filter((x) => x !== s) : [...p, s])}
                          className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest border-2 transition-all ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-400 border-slate-50"}`}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
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

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-slate-100" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">ou</span>
                  <div className="h-px flex-1 bg-slate-100" />
                </div>

                <button onClick={handleGoogleLogin} disabled={signupLoading}
                  className="w-full p-5 bg-white border-2 border-slate-100 rounded-[28px] font-black uppercase tracking-wider text-slate-700 shadow-sm active:scale-95 disabled:opacity-60 flex items-center justify-center gap-3 hover:border-slate-200">
                  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  Continuar com o Google
                </button>
              </div>
            )}

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
        <Sidebar
          open={sidebarOpen} onClose={() => setSidebarOpen(false)}
          session={session} actingTeacher={actingTeacher} tabletMode={tabletMode} view={view}
          onNavigate={sidebarNavigate}
          onOpenAdmin={() => { setSidebarOpen(false); setView("admin_home"); }}
          onSwitchTeacher={() => { setSidebarOpen(false); setTeacherSearch(""); }}
          onLogout={() => { setSidebarOpen(false); handleLogout(); }}
        />
        <button onClick={() => setSidebarOpen(true)}
          className="fixed bottom-5 left-5 z-30 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-2xl flex items-center justify-center active:scale-90" title="Menu">
          <Layout size={22} />
        </button>
        <div className="w-full max-w-md space-y-6">
          {canOpenAdmin && (
            <button onClick={() => setView("admin_home")}
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

      <Sidebar
        open={sidebarOpen} onClose={() => setSidebarOpen(false)}
        session={session} actingTeacher={actingTeacher} tabletMode={tabletMode} view={view}
        onNavigate={sidebarNavigate}
        onOpenAdmin={() => { setSidebarOpen(false); setView("admin_home"); }}
        onSwitchTeacher={() => { setSidebarOpen(false); setView("choose_teacher"); setTeacherSearch(""); }}
        onLogout={() => { setSidebarOpen(false); handleLogout(); }}
      />

      {/* Floating button to open the sidebar (minimized by default) */}
      <button onClick={() => setSidebarOpen(true)}
        className="fixed bottom-5 left-5 z-30 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-2xl flex items-center justify-center active:scale-90" title="Menu">
        <Layout size={22} />
      </button>

      <div>

      {view === "teacher_home" && actingTeacher && (
        <TeacherHome
          actingTeacher={actingTeacher}
          tabletMode={tabletMode}
          classes={classes} logs={logs} lessonPlans={lessonPlans}
          setView={setView} setSelectedClass={setSelectedClass} setOriginView={setOriginView}
          onSwitchTeacher={() => { setView("choose_teacher"); setTeacherSearch(""); }}
          onOpenAdmin={() => setView("admin_home")}
          onOpenSubs={() => { setOriginView("teacher_home"); setView("subs"); }}
          onSetClassPlan={onSetClassPlan}
          onExit={() => {
            if (tabletMode) { setView("choose_teacher"); setActingTeacher(null); return; }
            handleLogout();
          }}
          canOpenAdmin={session?.role === "admin"}
        />
      )}

      {view === "subs" && actingTeacher && (
        <Substitutions
          actingTeacher={actingTeacher} teachers={teachers} subs={subs}
          classes={classes} lessonPlans={lessonPlans} logs={logs}
          onSubmitSub={onSubmitSub} onConfirmSub={onConfirmSub} notify={notify}
          onBack={() => setView(originView || "teacher_home")}
        />
      )}

      {view === "tuners" && actingTeacher && (
        <Tuners
          actingTeacher={actingTeacher} examReqs={examReqs} recoveryReqs={recoveryReqs}
          onAddTunerRequest={onAddTunerRequest} notify={notify}
          onBack={() => setView(originView || "teacher_home")}
        />
      )}

      {view === "tuner_dept" && actingTeacher && (
        <TunerDepartment
          actingTeacher={actingTeacher} examReqs={examReqs} recoveryReqs={recoveryReqs}
          onClaimTunerRequest={onClaimTunerRequest} onDeleteTunerRequest={onDeleteTunerRequest} notify={notify}
          onBack={() => setView(originView || "teacher_home")}
        />
      )}

      {view === "assistant" && actingTeacher && (
        <AssistantRequests
          actingTeacher={actingTeacher} schools={session?.schools || []}
          physExams={physExams} tkExercises={tkExercises}
          onAddAssistantRequest={onAddAssistantRequest} notify={notify}
          onBack={() => setView(originView || "teacher_home")}
        />
      )}

      {view === "assistant_dept" && actingTeacher && (
        <AssistantDepartment
          actingTeacher={actingTeacher} schools={session?.schools || []}
          physExams={physExams} tkExercises={tkExercises}
          onUpdateAssistantRequest={onUpdateAssistantRequest} onDeleteAssistantRequest={onDeleteAssistantRequest} notify={notify}
          onBack={() => setView(originView || "teacher_home")}
        />
      )}

      {view === "admin_home" && session?.role === "admin" && (
        <AdminDashboard
          teachers={teachers} classes={classes} lessonPlans={lessonPlans}
          logs={logs} accounts={accounts} tabletMode={tabletMode}
          notify={notify} setView={setView}
          setSelectedClass={setSelectedClass} setOriginView={setOriginView}
          adminPin={adminPin} setAdminPin={setAdminPin} setTabletMode={setTabletMode}
          onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove}
          subs={subs} onDeleteSub={onDeleteSub}
          examReqs={examReqs} recoveryReqs={recoveryReqs} physExams={physExams} tkExercises={tkExercises}
          onDeleteTunerRequest={onDeleteTunerRequest} onDeleteAssistantRequest={onDeleteAssistantRequest}
          tab={adminTab} setTab={setAdminTab}
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
    </div>
  );
}
