import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  Bell,
  ChevronRight,
  Clock,
  Download,
  Search,
  BookMarked,
  FileText,
  TrendingUp,
  Award,
  LogOut,
  Plus,
  Trash2,
  Settings,
  FileQuestion,
  Loader2,
  Wifi,
  WifiOff,
  CloudUpload,
  CheckCircle2,
  Image as ImageIcon,
  X,
  Edit2,
  Save,
  School,
  Eye,
  LayoutDashboard,
  Layers,
  Users2,
  FolderOpen,
  GraduationCap
} from 'lucide-react';
import { PROFESSORS, MODULES, ROOMS, TIME_SLOTS, DAYS, DEFAULT_SCHEDULE, DEFAULT_FILIERES, generateId, type Course, type DaySchedule, type Filiere } from './data';

// Firebase imports
import { auth, db, storage, googleProvider } from './firebase';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';

// --- Types ---
type ResourceType = 'Cours' | 'TD' | 'TP' | 'QCM' | 'Ancien Examen';
type Priority = 'Urgent' | 'Important' | 'Info';
type AdminSection = 'dashboard' | 'filieres' | 'semestres' | 'modules' | 'enseignants' | 'documents' | 'utilisateurs';

interface Resource {
  id: string;
  title: string;
  type: ResourceType;
  subject: string;
  professor: string;
  filiereId?: string;
  filiereName?: string;
  date: string;
  size: string;
  downloads: number;
  pdfUrl: string;
  storagePath?: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
  priority: Priority;
  author: string;
  imageUrl?: string;
  imageStoragePath?: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  modules: number;
}

interface FooterDeveloper {
  name: string;
  initials: string;
  role: string;
  academicEmail: string;
  personalEmail: string;
  phone: string;
  imageUrl: string;
  linkedinUrl: string;
}

// --- Démo Data ---
const DEMO_RESOURCES: Resource[] = [
  // ===== SECTION A: Cours =====
];

const DEMO_ANNOUNCEMENTS: Announcement[] = [
];

// =======================================================
// LOGO COMPONENT
// =======================================================
function ESTLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const imgSizeMap = { sm: 'h-10', md: 'h-14', lg: 'h-20' };
  const textSizeMap = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' };
  return (
    <div className="flex items-center gap-3">
      <img src="/images/est-logo.png" alt="EST Meknès" className={`${imgSizeMap[size]} w-auto object-contain`} />
      <div className="flex flex-col justify-center">
        <span className={`font-black text-gray-900 leading-tight tracking-tight ${textSizeMap[size]}`}>EST Meknès</span>
      </div>
    </div>
  );
}

// =======================================================
// TOAST COMPONENT
// =======================================================
const Toast = ({ message, type }: { message: string; type: 'success' | 'error' | 'info' }) => {
  const colors = { success: 'bg-emerald-500', error: 'bg-red-500', info: 'bg-blue-500' };
  const icons = {
    success: <CheckCircle2 className="w-4 h-4" />,
    error: <WifiOff className="w-4 h-4" />,
    info: <Bell className="w-4 h-4" />
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.3 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.5 }}
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white shadow-2xl flex items-center gap-2 ${colors[type]} z-[100]`}
    >
      {icons[type]}
      <span className="font-medium text-sm">{message}</span>
    </motion.div>
  );
};

// =======================================================
// MAIN APP
// =======================================================
export default function App() {
  // --- Auth State ---
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [pendingAdminUser, setPendingAdminUser] = useState<FirebaseUser | null>(null);

  // --- App State ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'resources' | 'schedule' | 'announcements' | 'admin'>('dashboard');
  const [resources, setResources] = useState<Resource[]>(DEMO_RESOURCES);
  const [announcements, setAnnouncements] = useState<Announcement[]>(DEMO_ANNOUNCEMENTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [resourceFilter, setResourceFilter] = useState<'Tous' | ResourceType>('Tous');
  const [firebaseConnected, setFirebaseConnected] = useState(true);

  // --- Filière State ---
  const [filieres, setFilieres] = useState<Filiere[]>(DEFAULT_FILIERES);
  const [selectedFiliere, setSelectedFiliere] = useState<string>('');
  const [resourceFiliere, setResourceFiliere] = useState<string>('');
  const [publishFiliere, setPublishFiliere] = useState<string>('');
  const [scheduleByFiliere, setScheduleByFiliere] = useState<Record<string, DaySchedule[]>>({});

  // --- Admin Form ---
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<ResourceType>('Cours');
  const [newSubject, setNewSubject] = useState('');
  const [newProfessor, setNewProfessor] = useState('');
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState('');
  const [newAnnouncementContent, setNewAnnouncementContent] = useState('');
  const [newAnnouncementPriority, setNewAnnouncementPriority] = useState<Priority>('Info');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // --- Admin Tabs ---
  const [adminTab, setAdminTab] = useState<AdminSection>('dashboard');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    email: '',
    phone: '',
    department: ''
  });

  // --- Schedule Edit State ---
  const [editingSchedule, setEditingSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [selectedDay, setSelectedDay] = useState<string>('Lundi');
  const [showAddCourse, setShowAddCourse] = useState(false);

  // --- New Course Form ---
  const [courseSubject, setCourseSubject] = useState('');
  const [courseProf, setCourseProf] = useState('');
  const [courseRoom, setCourseRoom] = useState('Amphi A');
  const [courseTime, setCourseTime] = useState('08:30 - 10:30');
  const [courseType, setCourseType] = useState('Cours');
  const [editingScheduleCourseId, setEditingScheduleCourseId] = useState<string | null>(null);

  // --- Filière Form ---
  const [newFiliereName, setNewFiliereName] = useState('');
  const [newFiliereCode, setNewFiliereCode] = useState('');
  const [moduleForm, setModuleForm] = useState({
    name: '',
    code: '',
    filiereId: '',
    semester: '',
    teacherId: '',
    description: ''
  });
  const [customModules, setCustomModules] = useState<Array<{
    id: string;
    name: string;
    code: string;
    filiereId: string;
    semester: string;
    teacherId: string;
    description: string;
  }>>([]);
  const [activeFooterProfile, setActiveFooterProfile] = useState<FooterDeveloper | null>(null);

  const [toastMessage, setToastMessage] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // --- Toast Helper ---
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // ===================================================
  // 🔥 FIREBASE AUTH
  // ===================================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.email && user.email.endsWith('@edu.umi.ac.ma')) {
          setFirebaseUser(user);
          const adminFlag = localStorage.getItem('estm_admin_verified');
          if (user.email === 'admin@edu.umi.ac.ma' && adminFlag === 'true') {
            setIsAdmin(true);
          }
        } else {
          signOut(auth);
          setAuthError('Seuls les emails @edu.umi.ac.ma sont autorisés');
        }
      } else {
        setFirebaseUser(null);
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ===================================================
  // 🔥 FIRESTORE - Resources
  // ===================================================
 useEffect(() => {
    // 1. كنجيبو المعلومات من Firestore
    const q = query(collection(db, 'resources'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFirebaseConnected(true);
      
      // 2. كنحولوا الداتا ديما سواء كانت خاوية ولا عامرة
      const docs: Resource[] = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || '',
          type: data.type || 'Cours',
          subject: data.subject || '',
          professor: data.professor || '',
          filiereId: data.filiereId || '',
          filiereName: data.filiereName || '',
          date: data.date || '',
          size: data.size || '',
          downloads: data.downloads || 0,
          pdfUrl: data.pdfUrl || '',
          storagePath: data.storagePath || ''
        };
      });

      // 3. كنحدثوا الشاشة فالبلاصة
      setResources(docs);
    }, (error) => {
      console.error("Firebase Snapshot Error: ", error);
    });

    return () => unsubscribe();
  }, []);

  // ===================================================
  // 🔥 FIRESTORE - Announcements
  // ===================================================
  useEffect(() => {
    // 1. كنجيبو الإعلانات مرتبة من الأحدث للأقدم
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // 2. كنحولوا الداتا ديما (حيدنا if !snapshot.empty باش التحديث يكون فوري)
      const docs: Announcement[] = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || '',
          content: data.content || '',
          date: data.date || '',
          priority: data.priority || 'Info',
          author: data.author || '',
          imageUrl: data.imageUrl || '',
          imageStoragePath: data.imageStoragePath || ''
        };
      });

      // 3. كنحدثوا الليستة فالبلاصة، إلا كانت خاوية فـ Firebase غتخوا حتى فالسيت
      setAnnouncements(docs);
    }, (error) => {
      console.error("Announcements Error: ", error);
    });

    return () => unsubscribe();
  }, []);
  // ===================================================
  // 🔥 FIRESTORE - Filières
  // ===================================================
  useEffect(() => {
    try {
      const q = query(collection(db, 'filieres'), orderBy('name', 'asc'));
      const unsubscribe = onSnapshot(q,
        (snapshot) => {
          if (!snapshot.empty) {
            const docs: Filiere[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Filiere));
            setFilieres(docs);
          }
        },
        () => { }
      );
      return () => unsubscribe();
    } catch { }
  }, []);

  // ===================================================
  // 🔥 FIRESTORE - Teachers
  // ===================================================
  useEffect(() => {
    try {
      const q = query(collection(db, 'teachers'), orderBy('name', 'asc'));
      const unsubscribe = onSnapshot(q,
        (snapshot) => {
          const docs: Teacher[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || '',
              email: data.email || '',
              phone: data.phone || '',
              department: data.department || '',
              modules: data.modules || 0
            };
          });
          setTeachers(docs);
        },
        (error) => {
          console.error('Teachers Snapshot Error: ', error);
        }
      );
      return () => unsubscribe();
    } catch { }
  }, []);

  // ===================================================
  // 🔥 FIRESTORE - Schedule
  // ===================================================
  useEffect(() => {
    try {
      const q = query(collection(db, 'schedules'));
      const unsubscribe = onSnapshot(q,
        (snapshot) => {
          if (!snapshot.empty) {
            const grouped: Record<string, DaySchedule[]> = {};
            snapshot.docs.forEach((docSnap) => {
              const data = docSnap.data();
              const filiereId = data.filiereId || 'tm-fba-a';
              const day = data.day || docSnap.id;
              if (!grouped[filiereId]) {
                grouped[filiereId] = DAYS.map((d) => ({ day: d, courses: [] }));
              }
              const dayIndex = grouped[filiereId].findIndex((entry) => entry.day === day);
              if (dayIndex >= 0) {
                grouped[filiereId][dayIndex] = { day, courses: data.courses || [] };
              }
            });
            setScheduleByFiliere(grouped);
          }
        },
        () => { }
      );
      return () => unsubscribe();
    } catch { }
  }, []);

  useEffect(() => {
    if (!selectedFiliere) {
      setEditingSchedule(DAYS.map((day) => ({ day, courses: [] })));
      return;
    }

    const filiereDefaultSchedule = filieres.find((f) => f.id === selectedFiliere)?.schedules || DEFAULT_SCHEDULE;
  setEditingSchedule(scheduleByFiliere[selectedFiliere] || DAYS.map(day => ({ day, courses: [] })));
  }, [selectedFiliere, scheduleByFiliere, filieres]);

  useEffect(() => {
    if (!activeFooterProfile) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveFooterProfile(null);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeFooterProfile]);

  // ===================================================
  // 🔐 GOOGLE LOGIN
  // ===================================================
  const handleGoogleLogin = async () => {
    setAuthError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || '';

      if (!email.endsWith('@edu.umi.ac.ma')) {
        await signOut(auth);
        setAuthError('❌ Accès refusé. Utilisez votre email académique (@edu.umi.ac.ma)');
        return;
      }

      if (email === 'admin@edu.umi.ac.ma') {
        setPendingAdminUser(result.user);
        setShowAdminPassword(true);
        return;
      }

      setFirebaseUser(result.user);
      showToast(`Bienvenue ${result.user.displayName || email} !`);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;
      console.warn('Firebase Auth error:', err.message);
      setAuthError('Firebase non configuré. Mode démonstration.');
    }
  };

  // --- Demo Login ---
  const [demoEmail, setDemoEmail] = useState('');
  const [demoPassword, setDemoPassword] = useState('');

  const handleDemoLogin = (e: React.FormEvent) => {
  e.preventDefault();

  // 1. الإيميلات اللي مسموح ليهم يدخلو من هاد الخانة
  const adminEmail = 'admin@edu.umi.ac.ma';
  const samirEmail = 'samirdani1@edu.umi.ac.ma';
  const sanaeEmail = 'sanaedani@edu.umi.ac.ma'; // <-- بدل هادي بالإيميل اللي بغيتي تعطي لأختك

  // 2. الشروط ديال الدخول
  if (demoEmail === adminEmail && demoPassword === 'ESTM2026') {
    // دخول كإدارة
    setFirebaseUser({ email: adminEmail, displayName: 'Admin ESTM' } as any);
    setIsAdmin(true);
    localStorage.setItem('estm_admin_verified', 'true');
    showToast('Bienvenue Administrateur !');

  } else if (demoEmail === samirEmail ) { 
    // دخول ديالك نتا كأدمن
    setFirebaseUser({ email: samirEmail, displayName: 'Samir Dani' } as any);
    setIsAdmin(true); 
    localStorage.setItem('estm_admin_verified', 'true');
    showToast('Bienvenue Samir !');

  } else if (demoEmail === sanaeEmail ) {
    // دخول ديال أختك كطالبة عادية (بدون صلاحيات الإدارة)
    setFirebaseUser({ email: sanaeEmail, displayName: 'Sanae Dani' } as any); // <-- كتب سميتها هنا باش تطلع ليها الفوق
    setIsAdmin(false); // <-- ها السر: عطيناها false باش ما تكونش أدمن
    localStorage.removeItem('estm_admin_verified'); // تأكيد باش ما يوقعش شي خطأ فالتسجيل
    showToast('Bienvenue !');

  } else {
    // 3. أي طالب آخر كتب الإيميل ديالو بيديو غيطلع ليه هاد الإيرور
    setAuthError('عذراً، هاد الخانة مخصصة للإدارة فقط. المرجو الدخول عبر زر Google ⚠️');
  }
};

  // ===================================================
  // 🚪 LOGOUT
  // ===================================================
  const handleLogout = async () => {
    try { await signOut(auth); } catch { }
    setFirebaseUser(null);
    setIsAdmin(false);
    setActiveTab('dashboard');
    setAdminTab('dashboard');
    resetTeacherForm();
    localStorage.removeItem('estm_admin_verified');
  };

  // ===================================================
  // 📤 UPLOAD PDF
  // ===================================================
  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        showToast('Veuillez sélectionner un fichier PDF', 'error');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        showToast('Le fichier ne doit pas dépasser 50 MB', 'error');
        return;
      }
      setSelectedPdf(file);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        showToast('Veuillez sélectionner une image', 'error');
        return;
      }
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handlePublishResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPdf) {
      showToast('Veuillez ajouter un fichier PDF', 'error');
      return;
    }
    if (!newTitle || !newSubject || !newProfessor) {
      showToast('Veuillez remplir tous les champs', 'error');
      return;
    }
    if (!publishFiliere) {
      showToast('Choisissez une filière avant de publier', 'error');
      return;
    }

    const selectedPublishFiliere = filieres.find((f) => f.id === publishFiliere);

    setIsUploading(true);
    setUploadProgress(0);

   try {
      if (!selectedPdf) return;

      // 1. تحديد نوع الملف (تصويرة ولا PDF)
      const isImage = selectedPdf.type.startsWith('image/');
      const uploadType = isImage ? 'image' : 'raw';

      const formData = new FormData();
      formData.append('file', selectedPdf);
      formData.append('upload_preset', 'verratti_vip'); // الـ Preset ديالك

      setUploadProgress(20);

      // 2. الرفع لـ Cloudinary باستخدام الـ Cloud Name ديالك: do7kxcqtg
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/do7kxcqtg/${uploadType}/upload`,
        { method: 'POST', body: formData }
      );

      if (!response.ok) throw new Error('Cloudinary Upload Failed');

      const data = await response.json();
      const downloadURL = data.secure_url;
      setUploadProgress(80);

      // 3. التسجيل في Firestore (قاعدة البيانات الحقيقية)
      await addDoc(collection(db, 'resources'), {
        title: newTitle,
        type: newType,
        subject: newSubject,
        professor: newProfessor,
        filiereId: publishFiliere,
        filiereName: selectedPublishFiliere?.name || '',
        date: new Date().toISOString().split('T')[0],
        size: (selectedPdf.size / (1024 * 1024)).toFixed(1) + ' MB',
        downloads: 0,
        pdfUrl: downloadURL, 
        fileType: isImage ? 'image' : 'pdf',
        createdAt: serverTimestamp(),
        uploadedBy: firebaseUser?.email || 'admin'
      });

      setUploadProgress(100);
      showToast(`✅ ${newType} publié avec succès !`);

    } catch (err: any) {
      console.error('Upload error:', err);
      showToast('Erreur lors de la publication', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setNewTitle('');
      setNewSubject('');
      setNewProfessor('');
      setSelectedPdf(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ===================================================
  // 📢 PUBLISH ANNOUNCEMENT WITH IMAGE
  // ===================================================
  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnouncementTitle || !newAnnouncementContent) {
      showToast('Veuillez remplir tous les champs', 'error');
      return;
    }

    try {
      if (firebaseConnected) {
        let imageUrl = '';
        let imageStoragePath = '';

        if (selectedImage) {
          const imgName = `${Date.now()}_${selectedImage.name}`;
          const imgRef = ref(storage, `announcements/${imgName}`);
          const imgTask = uploadBytesResumable(imgRef, selectedImage);

          await new Promise<void>((resolve, reject) => {
            imgTask.on('state_changed',
              () => { },
              (error) => reject(error),
              async () => {
                imageUrl = await getDownloadURL(imgTask.snapshot.ref);
                imageStoragePath = `announcements/${imgName}`;
                resolve();
              }
            );
          });
        }

        await addDoc(collection(db, 'announcements'), {
          title: newAnnouncementTitle,
          content: newAnnouncementContent,
          priority: newAnnouncementPriority,
          date: new Date().toISOString().split('T')[0],
          author: 'Administration',
          imageUrl,
          imageStoragePath,
          createdAt: serverTimestamp()
        });
        showToast('✅ Annonce publiée sur Firebase !');
      } else {
        const newAnn: Announcement = {
          id: Date.now().toString(),
          title: newAnnouncementTitle,
          content: newAnnouncementContent,
          priority: newAnnouncementPriority,
          date: new Date().toISOString().split('T')[0],
          author: 'Administration',
          imageUrl: selectedImage ? URL.createObjectURL(selectedImage) : undefined
        };
        setAnnouncements(prev => [newAnn, ...prev]);
        showToast('✅ Annonce publiée (mode démo)');
      }
    } catch (err: any) {
      showToast('Erreur : ' + (err.message || ''), 'error');
    }

    setNewAnnouncementTitle('');
    setNewAnnouncementContent('');
    setNewAnnouncementPriority('Info');
    setSelectedImage(null);
    setImagePreview(null);
  };

  // ===================================================
  // 🗑️ DELETE
  // ===================================================
  const handleDeleteResource = async (resource: Resource) => {
    try {
      if (firebaseConnected) {
        await deleteDoc(doc(db, 'resources', resource.id));
        // ملحوظة: Cloudinary ما كيتمسحش بـ deleteObject حيت ماشي Firebase Storage
      }
      
      // هاد السطر هو السر: كيتمسح من الشاشة فالحين
      setResources(prev => prev.filter(r => r.id !== resource.id));
      showToast('Document supprimé', 'info');
      
    } catch (err: any) {
      console.error(err);
      showToast('Erreur suppression', 'error');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      if (firebaseConnected) {
        await deleteDoc(doc(db, 'announcements', id));
      }
      
      // كيمسح الإعلان من الشاشة فالحين
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      showToast('Annonce supprimée', 'info');
      
    } catch (err: any) {
      console.error(err);
      showToast('Erreur suppression', 'error');
    }
  };

  // ===================================================
  // 📥 DOWNLOAD
  // ===================================================
  const handleDownload = (resource: Resource) => {
    if (resource.pdfUrl) {
      window.open(resource.pdfUrl, '_blank');
    } else {
      const blob = new Blob([`Fichier: ${resource.title}`], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${resource.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    showToast(`Téléchargement: ${resource.title}`);
  };

  // ===================================================
  // 📅 SCHEDULE HELPERS
  // ===================================================
  const getCurrentDay = () => {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[new Date().getDay()];
  };

  const currentDay = getCurrentDay();
  const currentSchedule = editingSchedule.find(s => s.day === currentDay)?.courses || [];
  const selectedResourcePool = resourceFiliere ? resources.filter((r) => r.filiereId === resourceFiliere) : [];

  const filteredResources = resources.filter(r => {
    const matchesFiliere = Boolean(resourceFiliere) && r.filiereId === resourceFiliere;
    const matchesFilter = resourceFilter === 'Tous' || r.type === resourceFilter;
    const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.professor.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFiliere && matchesFilter && matchesSearch;
  });

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'Important': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Info': return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getTypeIcon = (type: ResourceType) => {
    switch (type) {
      case 'Cours': return <BookOpen className="w-5 h-5 text-emerald-600" />;
      case 'TD': return <FileText className="w-5 h-5 text-teal-600" />;
      case 'TP': return <TrendingUp className="w-5 h-5 text-cyan-600" />;
      case 'QCM': return <FileQuestion className="w-5 h-5 text-indigo-600" />;
      case 'Ancien Examen': return <Award className="w-5 h-5 text-amber-600" />;
    }
  };

  const getTypeColor = (type: ResourceType) => {
    switch (type) {
      case 'Cours': return 'bg-emerald-50 text-emerald-700';
      case 'TD': return 'bg-teal-50 text-teal-700';
      case 'TP': return 'bg-cyan-50 text-cyan-700';
      case 'QCM': return 'bg-indigo-50 text-indigo-700';
      case 'Ancien Examen': return 'bg-amber-50 text-amber-700';
    }
  };

  // ===================================================
  // 📅 SCHEDULE CRUD
  // ===================================================
  const handleAddCourse = () => {
    if (!selectedFiliere) {
      showToast('Choisissez une filière avant de modifier son emploi du temps', 'error');
      return;
    }
    if (!courseSubject || !courseProf) {
      showToast('Veuillez remplir la matière et le professeur', 'error');
      return;
    }

    const newCourse: Course = {
      id: generateId(),
      time: courseTime,
      subject: courseSubject,
      prof: courseProf,
      room: courseRoom,
      type: courseType
    };

    const updated = editingSchedule.map(day => {
      if (day.day === selectedDay) {
        return { ...day, courses: [...day.courses, newCourse] };
      }
      return day;
    });

    setEditingSchedule(updated);
    setShowAddCourse(false);
    setCourseSubject('');
    setCourseProf('');
    setCourseRoom('Amphi A');
    setCourseTime('08:30 - 10:30');
    setCourseType('Cours');
    setEditingScheduleCourseId(null);
    showToast('Cours ajouté', 'success');
  };

  const handleStartEditCourse = (course: Course) => {
    setEditingScheduleCourseId(course.id);
    setShowAddCourse(true);
    setCourseSubject(course.subject);
    setCourseProf(course.prof);
    setCourseRoom(course.room);
    setCourseTime(course.time);
    setCourseType(course.type);
  };

  const handleUpdateCourse = () => {
    if (!editingScheduleCourseId) return;
    if (!courseSubject || !courseProf) {
      showToast('Veuillez remplir la matière et le professeur', 'error');
      return;
    }

    const updated = editingSchedule.map((day) => {
      if (day.day !== selectedDay) return day;
      return {
        ...day,
        courses: day.courses.map((course) =>
          course.id === editingScheduleCourseId
            ? {
              ...course,
              subject: courseSubject,
              prof: courseProf,
              room: courseRoom,
              time: courseTime,
              type: courseType
            }
            : course
        )
      };
    });

    setEditingSchedule(updated);
    setShowAddCourse(false);
    setEditingScheduleCourseId(null);
    setCourseSubject('');
    setCourseProf('');
    setCourseRoom('Amphi A');
    setCourseTime('08:30 - 10:30');
    setCourseType('Cours');
    showToast('Cours modifié', 'success');
  };

  const handleDeleteCourse = (courseId: string) => {
    const updated = editingSchedule.map(day => {
      if (day.day === selectedDay) {
        return { ...day, courses: day.courses.filter(c => c.id !== courseId) };
      }
      return day;
    });
    setEditingSchedule(updated);
    if (editingScheduleCourseId === courseId) setEditingScheduleCourseId(null);
    showToast('Cours supprimé', 'info');
  };

  const handleSaveSchedule = async () => {
    if (!selectedFiliere) {
      showToast('Choisissez une filière à sauvegarder', 'error');
      return;
    }

    try {
      if (firebaseConnected) {
        for (const day of editingSchedule) {
          await setDoc(doc(db, 'schedules', `${selectedFiliere}_${day.day}`), {
            filiereId: selectedFiliere,
            day: day.day,
            courses: day.courses,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
        setScheduleByFiliere((prev) => ({ ...prev, [selectedFiliere]: editingSchedule }));
        showToast('✅ Emploi du temps sauvegardé pour cette filière', 'success');
      } else {
        setScheduleByFiliere((prev) => ({ ...prev, [selectedFiliere]: editingSchedule }));
        showToast('✅ Emploi du temps sauvegardé (mode démo)', 'success');
      }
    } catch (err: any) {
      showToast('Erreur sauvegarde', 'error');
    }
  };

  // ===================================================
  // 🏫 FILIÈRE CRUD
  // ===================================================
  const handleAddFiliere = async () => {
    if (!newFiliereName || !newFiliereCode) {
      showToast('Veuillez remplir le nom et le code', 'error');
      return;
    }

    const newFiliere: Filiere = {
      id: generateId(),
      name: newFiliereName,
      code: newFiliereCode,
      schedules: DEFAULT_SCHEDULE
    };

    try {
      if (firebaseConnected) {
        await addDoc(collection(db, 'filieres'), newFiliere);
        showToast('✅ Filière ajoutée sur Firebase !', 'success');
      } else {
        setFilieres(prev => [...prev, newFiliere]);
        setScheduleByFiliere((prev) => ({ ...prev, [newFiliere.id]: DEFAULT_SCHEDULE }));
        showToast('✅ Filière ajoutée (mode démo)', 'success');
      }
      setSelectedFiliere(newFiliere.id);
      setResourceFiliere(newFiliere.id);
      setPublishFiliere(newFiliere.id);
      setNewFiliereName('');
      setNewFiliereCode('');
    } catch (err: any) {
      showToast('Erreur', 'error');
    }
  };

  const handleDeleteFiliere = async (id: string) => {
    try {
      // 1. المسح من قاعدة البيانات
      if (firebaseConnected) {
        await deleteDoc(doc(db, 'filieres', id));
      }

      // 2. المسح من الشاشة (هادا هو اللي كيغبرها فالبلاصة)
      setFilieres(prev => prev.filter(f => f.id !== id));
      
      // 3. تنظيف الاختيارات (باش ميبقاش السيت معلق على شعبة ممسوحة)
      if (selectedFiliere === id) setSelectedFiliere('');
      if (resourceFiliere === id) setResourceFiliere('');
      if (publishFiliere === id) setPublishFiliere('');

      showToast('Filière supprimée', 'info');
    } catch (error) {
      console.error(error);
      showToast('Erreur suppression', 'error');
    }
  };

  const resetModuleForm = () => {
    setModuleForm({
      name: '',
      code: '',
      filiereId: '',
      semester: '',
      teacherId: '',
      description: ''
    });
  };

  const handleSaveModule = (e: React.FormEvent) => {
    e.preventDefault();

    if (!moduleForm.name || !moduleForm.code || !moduleForm.filiereId || !moduleForm.semester) {
      showToast('Veuillez remplir les champs obligatoires', 'error');
      return;
    }

    const normalizedCode = moduleForm.code.trim().toUpperCase();
    const duplicateCode = customModules.some((entry) => entry.code === normalizedCode);
    if (duplicateCode) {
      showToast('Ce code module existe deja', 'error');
      return;
    }

    setCustomModules((prev) => [
      {
        id: generateId(),
        name: moduleForm.name.trim(),
        code: normalizedCode,
        filiereId: moduleForm.filiereId,
        semester: moduleForm.semester,
        teacherId: moduleForm.teacherId,
        description: moduleForm.description.trim()
      },
      ...prev
    ]);

    showToast('Module enregistre en mode demo', 'success');
    resetModuleForm();
  };

  // ===================================================
  // 👩‍🏫 TEACHERS CRUD
  // ===================================================
  const resetTeacherForm = () => {
    setTeacherForm({ name: '', email: '', phone: '', department: '' });
    setEditingTeacherId(null);
    setShowTeacherForm(false);
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id);
    setTeacherForm({
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      department: teacher.department
    });
    setShowTeacherForm(true);
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!teacherForm.name || !teacherForm.email || !teacherForm.phone || !teacherForm.department) {
      showToast('Veuillez remplir toutes les informations', 'error');
      return;
    }

    const moduleCount = resources.filter(
      (resource) => resource.professor.trim().toLowerCase() === teacherForm.name.trim().toLowerCase()
    ).length;

    const payload = {
      name: teacherForm.name.trim(),
      email: teacherForm.email.trim(),
      phone: teacherForm.phone.trim(),
      department: teacherForm.department.trim(),
      modules: moduleCount
    };

    try {
      const teacherId = editingTeacherId || generateId();
      if (firebaseConnected) {
        await setDoc(doc(db, 'teachers', teacherId), {
          ...payload,
          updatedAt: serverTimestamp(),
          ...(editingTeacherId ? {} : { createdAt: serverTimestamp() })
        }, { merge: true });
      } else {
        if (editingTeacherId) {
          setTeachers((prev) => prev.map((t) => (t.id === teacherId ? { ...t, ...payload } : t)));
        } else {
          setTeachers((prev) => [...prev, { id: teacherId, ...payload }]);
        }
      }

      showToast(editingTeacherId ? 'Enseignant modifié' : 'Enseignant ajouté', 'success');
      resetTeacherForm();
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de la sauvegarde', 'error');
    }
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    try {
      if (firebaseConnected) {
        await deleteDoc(doc(db, 'teachers', teacherId));
      }
      setTeachers((prev) => prev.filter((teacher) => teacher.id !== teacherId));
      showToast('Enseignant supprimé', 'info');
    } catch (error) {
      console.error(error);
      showToast('Erreur suppression', 'error');
    }
  };

  // ===================================================
  // ⏳ LOADING SCREEN
  // ===================================================
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="mb-6 flex justify-center"><ESTLogo size="lg" /></div>
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Chargement...</p>
        </motion.div>
      </div>
    );
  }

  // ===================================================
  // 🔐 LOGIN PAGE
  // ===================================================
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/30 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#0d3558] via-[#114069] to-[#1b5b93]" />
          <div className="flex justify-center mb-8 mt-4"><ESTLogo size="lg" /></div>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#114069]">Espace Étudiant</h2>
            <p className="text-slate-500 mt-2 text-sm">Plateforme de partage des ressources EST Meknès</p>
          </div>

          <AnimatePresence>
            {showAdminPassword && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Settings className="w-4 h-4" /> Mot de passe Administrateur</p>
                <input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="Entrez le mot de passe admin" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 mb-3" autoFocus />
                <button onClick={handleAdminPasswordSubmit} className="w-full bg-slate-900 text-white py-2.5 rounded-xl font-bold hover:bg-slate-800">Valider</button>
              </motion.div>
            )}
          </AnimatePresence>

          {!showAdminPassword && (
            <>
              <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 text-slate-700 py-3.5 rounded-2xl font-bold hover:shadow-lg hover:border-slate-300 transition-all active:scale-[0.98] mb-4">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Se connecter avec Google
              </button>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">ou email académique</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <form onSubmit={handleDemoLogin} className="space-y-4">
                <input type="email" value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} placeholder="prenom.nom@edu.umi.ac.ma" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-sm" required />
                <AnimatePresence>
                  {demoEmail === 'admin@edu.umi.ac.ma' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <input type="password" value={demoPassword} onChange={(e) => setDemoPassword(e.target.value)} placeholder="Mot de passe admin (ESTM2026)" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-sm" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <button type="submit" className="w-full bg-[#114069] text-white py-3 rounded-xl font-bold hover:bg-[#0d3558] hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                  <LogOut className="w-5 h-5 rotate-180" /> Se Connecter
                </button>
              </form>
            </>
          )}

          <AnimatePresence>{authError && (<motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-red-500 text-sm font-medium mt-4 text-center bg-red-50 p-3 rounded-xl">{authError}</motion.p>)}</AnimatePresence>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">🔒 Accès réservé aux étudiants de l'EST Meknès</p>
            <p className="text-[10px] text-slate-300 mt-1">Email requis : @edu.umi.ac.ma</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ===================================================
  // 🏠 MAIN APP
  // ===================================================
  const navigateToResourceFilter = (filter: ResourceType) => {
    setActiveTab('resources');
    setResourceFilter(filter);
  };

  const userDisplayName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Étudiant';
  const currentFiliere = filieres.find(f => f.id === selectedFiliere);

  const adminMenu: { id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'filieres', label: 'Filières', icon: School },
    { id: 'semestres', label: 'Semestres', icon: Calendar },
    { id: 'modules', label: 'Modules', icon: Layers },
    { id: 'enseignants', label: 'Enseignants', icon: GraduationCap },
    { id: 'documents', label: 'Documents', icon: FolderOpen },
    { id: 'utilisateurs', label: 'Utilisateurs', icon: Users2 }
  ];

  const adminMeta: Record<AdminSection, { title: string; subtitle: string; ctaLabel?: string }> = {
    dashboard: {
      title: 'Dashboard Administration',
      subtitle: 'Vue globale des ressources, filières et activités pédagogiques.'
    },
    filieres: {
      title: 'Gestion des filières',
      subtitle: 'Ajoutez, consultez et supprimez les filières disponibles.',
      ctaLabel: '+ Ajouter une filière'
    },
    semestres: {
      title: 'Gestion des semestres',
      subtitle: 'Organisez les emplois du temps par filière et par jour.',
      ctaLabel: '+ Ajouter un cours'
    },
    modules: {
      title: 'Ajouter un module',
      subtitle: 'Créez un module et associez-le à une filière et un semestre.'
    },
    enseignants: {
      title: 'Gestion des enseignants',
      subtitle: 'Ajoutez et gérez les enseignants associés aux modules.',
      ctaLabel: '+ Ajouter un enseignant'
    },
    documents: {
      title: 'Gestion des documents',
      subtitle: 'Publiez et supprimez les supports pédagogiques PDF.',
      ctaLabel: '+ Publier un document'
    },
    utilisateurs: {
      title: 'Gestion des utilisateurs',
      subtitle: 'Consultez les comptes administrateurs et sessions actives.'
    }
  };

  const moduleOverview = MODULES.map((moduleName) => {
    const moduleResources = resources.filter((resource) => resource.subject === moduleName);
    const profCount = new Set(moduleResources.map((resource) => resource.professor)).size;
    return {
      moduleName,
      docs: moduleResources.length,
      profCount
    };
  }).sort((a, b) => b.docs - a.docs || a.moduleName.localeCompare(b.moduleName));

  const adminUsers = [
    {
      id: 'admin-main',
      name: 'Administration ESTM',
      email: 'admin@edu.umi.ac.ma',
      role: 'Administrateur',
      status: 'Actif'
    },
    {
      id: 'admin-samir',
      name: 'Samir Dani',
      email: 'samirdani1@edu.umi.ac.ma',
      role: 'Administrateur',
      status: 'Actif'
    },
    {
      id: 'current-user',
      name: userDisplayName,
      email: firebaseUser.email || 'inconnu',
      role: isAdmin ? 'Administrateur' : 'Étudiant',
      status: 'Connecté'
    }
  ];
  const uniqueAdminUsers = Array.from(new Map(adminUsers.map((adminUser) => [adminUser.email, adminUser])).values());

  const isAdminWorkspace = isAdmin && activeTab === 'admin';
  const publishedCourses = resources.filter((resource) => resource.type === 'Cours').length;
  const availableTDs = resources.filter((resource) => resource.type === 'TD').length;
  const availableTPs = resources.filter((resource) => resource.type === 'TP').length;
  const footerDevelopers: FooterDeveloper[] = [
    {
      name: 'Samir Dani',
      initials: 'SD',
      role: 'Développeur web',
      academicEmail: 'sa.dani@edu.umi.ac.ma',
      personalEmail: 'samirdani237@gmail.com',
      phone: '06 76 80 17 07',
      imageUrl: '/images/samir.jpeg',
      linkedinUrl: 'https://linkedin.com/in/samirdani/'
    }
  ];
  const footerNavigation = [
    {
      label: 'Accueil',
      action: () => setActiveTab('dashboard')
    },
    {
      label: 'Filières',
      action: () => {
        setActiveTab('resources');
        setResourceFilter('Tous');
        setSelectedFiliere('');
      }
    },
    {
      label: 'Modules',
      action: () => {
        setActiveTab('resources');
        setResourceFilter('Cours');
        setSelectedFiliere((currentFiliere) => {
          const isCurrentFiliereValid = filieres.some((filiere) => filiere.id === currentFiliere);
          return isCurrentFiliereValid ? currentFiliere : filieres[0]?.id || '';
        });
      }
    },
    {
      label: 'Documents',
      action: () => {
        setActiveTab('resources');
        setResourceFilter('Tous');
        setSelectedFiliere((currentFiliere) => {
          const isCurrentFiliereValid = filieres.some((filiere) => filiere.id === currentFiliere);
          return isCurrentFiliereValid ? currentFiliere : filieres[0]?.id || '';
        });
      }
    },
    {
      label: 'Contact',
      action: () => setActiveTab('announcements')
    }
  ];
  const handleFooterNavigation = (action: () => void, triggerButton?: HTMLButtonElement | null) => {
    action();
    window.setTimeout(() => {
      triggerButton?.blur();
      window.scrollTo(0, 0);
      const mainElement = document.querySelector('main');
      if (mainElement instanceof HTMLElement) {
        mainElement.scrollTo(0, 0);
      }
    }, 0);
    window.setTimeout(() => {
      triggerButton?.blur();
      window.scrollTo(0, 0);
      const mainElement = document.querySelector('main');
      if (mainElement instanceof HTMLElement) {
        mainElement.scrollTo(0, 0);
      }
    }, 180);
  };
  const closeFooterProfileModal = () => setActiveFooterProfile(null);

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col ${isAdminWorkspace ? 'pb-0' : 'pb-20 md:pb-0'}`}>
      <AnimatePresence>{toastMessage && <Toast message={toastMessage.msg} type={toastMessage.type} />}</AnimatePresence>

      {/* Header */}
      {!isAdminWorkspace && (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-20 flex items-center gap-4">
            <ESTLogo size="sm" />

            <nav className="hidden md:flex items-center gap-4 ml-auto">
              <button onClick={() => setActiveTab('dashboard')} className={`px-1 py-1 text-[14px] font-semibold border-b-2 transition-colors ${activeTab === 'dashboard' ? 'text-slate-900 border-amber-500' : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'}`}>
                Accueil
              </button>
              <button onClick={() => { setActiveTab('resources'); setResourceFilter('Tous'); }} className={`px-1 py-1 text-[14px] font-semibold border-b-2 transition-colors ${activeTab === 'resources' ? 'text-slate-900 border-amber-500' : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'}`}>
                Ressources
              </button>
              <button onClick={() => setActiveTab('schedule')} className={`px-1 py-1 text-[14px] font-semibold border-b-2 transition-colors ${activeTab === 'schedule' ? 'text-slate-900 border-amber-500' : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'}`}>
                Emploi
              </button>
              <button onClick={() => setActiveTab('announcements')} className={`px-1 py-1 text-[14px] font-semibold border-b-2 transition-colors ${activeTab === 'announcements' ? 'text-slate-900 border-amber-500' : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'}`}>
                Annonces
              </button>
            </nav>

            <div className="flex items-center gap-3">
              <button
                onClick={() => { setActiveTab('resources'); }}
                className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold hover:bg-slate-100 transition-colors"
              >
                <Search className="w-4 h-4" /> Recherche
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`hidden md:flex items-center px-5 py-2.5 rounded-xl border font-semibold transition-colors ${activeTab === 'admin' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'}`}
                >
                  Admin
                </button>
              )}
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors active:scale-95">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="hidden md:block h-1 bg-[#0b2f52]" />
        </header>
      )}

      <div className={`flex-1 w-full ${isAdminWorkspace ? 'flex' : ''} ${isAdminWorkspace ? '' : 'max-w-7xl mx-auto'}`}>
        {/* ===== MAIN CONTENT ===== */}
        <main className={`flex-1 overflow-y-auto ${isAdminWorkspace ? '' : activeTab === 'dashboard' ? 'px-4 pb-4 md:px-8 md:pb-8' : 'p-4 md:p-8'}`}>
          {/* ===================== DASHBOARD ===================== */}
          {activeTab === 'dashboard' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="relative -mx-4 md:-mx-8 overflow-hidden border-y border-[#2f5f8e]/60 bg-gradient-to-br from-[#0b2f52] via-[#114069] to-[#0f4a74] px-4 py-6 md:px-8 md:py-8 text-white lg:min-h-[620px]">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -top-20 right-4 h-72 w-72 rounded-full bg-cyan-200/10 blur-3xl" />
                  <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-blue-300/10 blur-2xl" />
                </div>

                <div className="relative z-10 grid h-full gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="flex h-full flex-col justify-between space-y-3">
                    <span className="inline-flex items-center rounded-lg border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-100 md:text-xs">
                      Plateforme académique EST Meknès
                    </span>

                    <div>
                      <h1 className="text-2xl font-black leading-[1.05] tracking-tight md:text-4xl xl:text-[32px]">Trouvez rapidement vos cours, TD et TP</h1>
                      <p className="mt-2 max-w-3xl text-sm text-slate-200 md:text-base md:leading-relaxed">
                        Explorez les ressources pédagogiques de l'EST Meknès par filière, module, semestre ou type de document dans un portail moderne et structuré.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          setActiveTab('resources');
                          setResourceFilter('Tous');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a4a84] px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-[#072746]/40 transition-colors hover:bg-[#0d5a9f]"
                      >
                        <Search className="w-3 h-3" /> Recherche rapide
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('resources');
                          setResourceFilter('Tous');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
                      >
                        <FolderOpen className="w-3 h-3" /> Explorer les documents
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-sm font-bold text-slate-100 md:text-base">
                        <GraduationCap className="w-3 h-3 text-slate-200" />
                        Filières <span className="text-amber-300">{filieres.length}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-sm font-bold text-slate-100 md:text-base">
                        <Layers className="w-3 h-3 text-slate-200" />
                        Modules <span className="text-amber-300">{MODULES.length}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-sm font-bold text-slate-100 md:text-base">
                        <FileText className="w-3 h-3 text-slate-200" />
                        Documents <span className="text-amber-300">{resources.length}</span>
                      </div>
                    </div>
                  </div>

                  <aside className="h-full rounded-xl border border-white/15 bg-white/8 p-3 md:p-3.5 backdrop-blur-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Vue d'ensemble</p>
                    <h3 className="mt-1.5 text-lg font-extrabold leading-tight md:text-xl">Des ressources classées intelligemment</h3>
                    <p className="mt-2 text-sm text-slate-200 md:text-sm">Par filière, semestre, module et type de contenu.</p>

                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 p-2">
                      <div className="h-10 w-10 rounded-lg border border-white/20 bg-white/10 p-1.5">
                        <img src="/images/est-logo.png" alt="EST Meknès" className="h-full w-full object-contain" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Portail ESTM</p>
                        <p className="text-xs font-semibold text-slate-100">Ressources organisées par semestre</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-white/10 p-2.5">
                        <p className="text-xs text-slate-200 flex items-center gap-1.5"><BookOpen className="w-3 h-3" /> Cours publiés</p>
                        <p className="mt-0.5 text-xl font-black text-white">{publishedCourses}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/10 p-2.5">
                        <p className="text-xs text-slate-200 flex items-center gap-1.5"><FileText className="w-3 h-3" /> TD disponibles</p>
                        <p className="mt-0.5 text-xl font-black text-white">{availableTDs}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/10 p-2.5 sm:col-span-2">
                        <p className="text-xs text-slate-200 flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> TP accessibles</p>
                        <p className="mt-0.5 text-xl font-black text-white">{availableTPs}</p>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Calendar className="text-emerald-500" /> Programme de {currentDay}</h3>
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-md font-bold">{currentSchedule.length} Séances</span>
                  </div>
                  <div className="space-y-3">
                    {currentSchedule.length > 0 ? currentSchedule.map((course) => (
                      <div key={course.id} className="flex gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-emerald-50/50 transition-colors">
                        <div className="flex flex-col items-center justify-center bg-white rounded-xl px-3 py-2 border border-slate-200 min-w-[80px]">
                          <span className="text-sm font-bold text-slate-800">{course.time.split(' - ')[0]}</span>
                          <span className="text-xs text-slate-400">à {course.time.split(' - ')[1]}</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800">{course.subject}</h4>
                          <p className="text-sm text-slate-600">{course.prof}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{course.type}</span>
                            <span className="text-xs text-slate-500">{course.room}</span>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-slate-400">
                        <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Aucun cours programmé aujourd'hui 🎉</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setActiveTab('schedule')} className="w-full mt-4 text-emerald-600 text-sm font-bold flex items-center justify-center gap-1 hover:text-emerald-700">
                    Voir la semaine complète <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-6"><Bell className="text-amber-500" /> Dernières Annonces</h3>
                  <div className="space-y-4">
                    {announcements.length > 0 ? announcements.slice(0, 3).map(ann => (
                      <div key={ann.id} className={`p-4 rounded-2xl border ${getPriorityColor(ann.priority)}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider">{ann.priority}</span>
                          <span className="text-xs opacity-75 ml-auto">{ann.date}</span>
                        </div>
                        <h4 className="font-bold mb-1">{ann.title}</h4>
                        <p className="text-sm opacity-90">{ann.content}</p>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-slate-400">
                        <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Aucune annonce pour le moment</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

           {/* ===================== RESOURCES ===================== */}
          {activeTab === 'resources' && (() => {
            const filterConfig: { label: string; value: 'Tous' | ResourceType; icon: React.ReactNode; activeBg: string; activeText: string; badgeBg: string }[] = [
              { label: 'Tous', value: 'Tous', icon: <BookMarked className="w-4 h-4" />, activeBg: 'bg-emerald-600', activeText: 'text-white', badgeBg: 'bg-emerald-500' },
              { label: 'Cours', value: 'Cours', icon: <BookOpen className="w-4 h-4" />, activeBg: 'bg-emerald-600', activeText: 'text-white', badgeBg: 'bg-emerald-500' },
              { label: 'TD', value: 'TD', icon: <FileText className="w-4 h-4" />, activeBg: 'bg-teal-600', activeText: 'text-white', badgeBg: 'bg-teal-500' },
              { label: 'TP', value: 'TP', icon: <TrendingUp className="w-4 h-4" />, activeBg: 'bg-cyan-600', activeText: 'text-white', badgeBg: 'bg-cyan-500' },
              { label: 'QCM', value: 'QCM', icon: <FileQuestion className="w-4 h-4" />, activeBg: 'bg-indigo-600', activeText: 'text-white', badgeBg: 'bg-indigo-500' },
              { label: 'Anciens Examens', value: 'Ancien Examen', icon: <Award className="w-4 h-4" />, activeBg: 'bg-amber-600', activeText: 'text-white', badgeBg: 'bg-amber-500' },
            ];
            return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {/* Sélecteur de filière */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row gap-4 md:items-center">
                  <div className="flex-shrink-0">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">📚 Filière</label>
                    <select value={resourceFiliere} onChange={(e) => { setResourceFiliere(e.target.value); setResourceFilter('Tous'); }} className="w-full md:w-80 px-4 py-2.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                      <option value="">— Choisir une filière —</option>
                      {filieres.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
                    </select>
                  </div>
                  <div className="relative flex-1 max-w-md">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">🔍 Recherche</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input type="text" placeholder="Chercher une matière, un prof..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 bg-slate-50" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Boutons de filtre avec couleurs distinctes */}
              {resourceFiliere && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">📂 Filtrer par type</p>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {filterConfig.map(({ label, value, icon, activeBg, activeText, badgeBg }) => {
                      const count = value === 'Tous' ? selectedResourcePool.length : selectedResourcePool.filter(r => r.type === value).length;
                      const isActive = resourceFilter === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setResourceFilter(value)}
                          className={`relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 border-2 ${
                            isActive
                              ? `${activeBg} ${activeText} border-transparent shadow-lg scale-[1.02]`
                              : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <span className={`p-1.5 rounded-lg ${isActive ? 'bg-white/20' : 'bg-white shadow-sm'}`}>{icon}</span>
                          <span className="text-xs leading-tight">{label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            isActive ? `${badgeBg} text-white` : 'bg-slate-200 text-slate-600'
                          }`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!resourceFiliere ? (
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl border-2 border-dashed border-emerald-200 p-16 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                    <BookMarked className="w-10 h-10 text-emerald-500" />
                  </div>
                  <p className="font-bold text-emerald-800 text-lg mb-2">Sélectionnez votre filière</p>
                  <p className="text-emerald-600 text-sm max-w-md mx-auto">Choisissez d'abord une filière dans le menu ci-dessus pour accéder aux Cours, TD, TP, QCM et Anciens Examens.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredResources.length > 0 ? filteredResources.map((resource) => {
                    const typeColorMap: Record<string, string> = {
                      'Cours': 'bg-emerald-50 text-emerald-600 border-emerald-200',
                      'TD': 'bg-teal-50 text-teal-600 border-teal-200',
                      'TP': 'bg-cyan-50 text-cyan-600 border-cyan-200',
                      'QCM': 'bg-indigo-50 text-indigo-600 border-indigo-200',
                      'Ancien Examen': 'bg-amber-50 text-amber-600 border-amber-200',
                    };
                    const iconBgMap: Record<string, string> = {
                      'Cours': 'bg-emerald-100',
                      'TD': 'bg-teal-100',
                      'TP': 'bg-cyan-100',
                      'QCM': 'bg-indigo-100',
                      'Ancien Examen': 'bg-amber-100',
                    };
                    return (
                  <motion.div layout key={resource.id} className={`bg-white p-5 rounded-2xl shadow-sm border-2 hover:shadow-lg transition-all group flex flex-col h-full ${resource.type === 'QCM' ? 'border-indigo-100' : resource.type === 'Ancien Examen' ? 'border-amber-100' : 'border-slate-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div className={`p-3 rounded-xl ${iconBgMap[resource.type] || 'bg-emerald-50'}`}>{getTypeIcon(resource.type)}</div>
                      <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${typeColorMap[resource.type] || getTypeColor(resource.type)}`}>{resource.type}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg mb-1 leading-tight">{resource.title}</h3>
                    <p className="text-sm text-slate-600 font-medium mb-1">{resource.subject}</p>
                    <p className="text-sm text-slate-500 mb-1">{resource.professor}</p>
                    <p className="text-xs text-emerald-600 font-semibold mb-1">{resource.filiereName || 'Filière non définie'}</p>
                    <p className="text-xs text-slate-400 mb-4">{resource.date}</p>
                    <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-medium">{resource.size}</span>
                        <span className="text-xs text-slate-300">•</span>
                        <span className="text-xs text-slate-400">{resource.downloads} ↓</span>
                      </div>
                      <button onClick={() => handleDownload(resource)} className={`flex items-center gap-1.5 font-bold text-sm active:scale-95 transition-all px-3 py-1.5 rounded-lg ${
                        resource.type === 'QCM' ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' :
                        resource.type === 'Ancien Examen' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' :
                        'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                      }`}>
                        <Download className="w-4 h-4" /> PDF
                      </button>
                    </div>
                  </motion.div>
                    );
                  }) : (
                    <div className="col-span-full text-center py-16 bg-white rounded-3xl border border-slate-100">
                      <BookMarked className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                      <p className="text-slate-500 font-medium">Aucun document « {resourceFilter} » trouvé pour cette filière</p>
                      <p className="text-slate-400 text-sm mt-1">Essayez un autre filtre ou une autre filière</p>
                      <button onClick={() => setResourceFilter('Tous')} className="mt-4 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-200 transition-colors">
                        Voir tous les documents
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
            );
          })()}

          {/* ===================== SCHEDULE ===================== */}
          {activeTab === 'schedule' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><Calendar className="text-emerald-500" /> Emploi du Temps</h2>
                    <p className="text-slate-500 text-sm mt-1">Semaine en cours - {currentFiliere?.name || 'Choisissez une filière'}</p>
                  </div>
                  <select value={selectedFiliere} onChange={(e) => setSelectedFiliere(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium">
                    <option value="">Choisir une filière</option>
                    {filieres.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}
                  </select>
                </div>

                {!selectedFiliere ? (
                  <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                    <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold">Choisissez d'abord une filière pour afficher son emploi du temps.</p>
                  </div>
                ) : (
                <div className="space-y-6">
                  {DAYS.map(day => {
                    const daySched = editingSchedule.find(s => s.day === day);
                    const courses = daySched?.courses || [];
                    const isToday = day === currentDay;

                    return (
                      <div key={day} className={`rounded-2xl border-2 overflow-hidden ${isToday ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-100 bg-white'}`}>
                        <div className={`px-4 py-3 font-bold flex items-center gap-2 ${isToday ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-700'}`}>
                          {day}
                          {isToday && <span className="ml-auto text-xs bg-white/20 px-2 py-1 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Aujourd'hui</span>}
                        </div>
                        <div className="p-4">
                          {courses.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {courses.map((course) => (
                                <div key={course.id} className={`p-4 rounded-xl border ${isToday ? 'bg-white border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold text-emerald-600">{course.time}</span>
                                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{course.type}</span>
                                  </div>
                                  <h4 className="font-bold text-slate-800">{course.subject}</h4>
                                  <p className="text-sm text-slate-600">{course.prof}</p>
                                  <p className="text-xs text-slate-400 mt-1">📍 {course.room}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-400 text-sm italic">Aucun cours</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ===================== ANNOUNCEMENTS ===================== */}
          {activeTab === 'announcements' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3 mb-6"><Bell className="text-amber-500" /> Toutes les Annonces</h2>
                <div className="space-y-4">
                  {announcements.length > 0 ? announcements.map(ann => (
                    <div key={ann.id} className={`p-6 rounded-2xl border ${getPriorityColor(ann.priority)}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider">{ann.priority}</span>
                        <span className="text-xs opacity-75 ml-auto">{ann.date}</span>
                      </div>
                      <h3 className="font-bold text-lg mb-2">{ann.title}</h3>
                      <p className="text-slate-700 mb-4">{ann.content}</p>
                      {ann.imageUrl && (
                        <div className="mt-4 rounded-xl overflow-hidden border border-white/20">
                          <img src={ann.imageUrl} alt="Annonce" className="w-full h-auto max-h-64 object-cover" />
                        </div>
                      )}
                      <p className="text-xs opacity-75 mt-4">📢 {ann.author}</p>
                    </div>
                  )) : (
                    <div className="text-center py-16 text-slate-400">
                      <Bell className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>Aucune annonce pour le moment</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ===================== ADMIN PANEL ===================== */}
          {activeTab === 'admin' && isAdmin && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full">
              <div className="bg-[#eef1f7] h-full min-h-0 p-2 md:p-6">
                {!firebaseConnected && (
                  <div className="mb-4 bg-amber-100 text-amber-700 border border-amber-200 rounded-xl p-3 text-sm flex items-center gap-2">
                    <WifiOff className="w-4 h-4" /> Mode démo - les modifications ne sont pas persistées.
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm h-full min-h-0">
                  <aside className="bg-[#0b2f52] text-white p-5 md:p-6 flex flex-col overflow-y-auto md:max-h-full">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-12 h-12 rounded-lg bg-white p-1.5">
                        <img src="/images/est-logo.png" alt="EST Meknès" className="w-full h-full object-contain" />
                      </div>
                      <div>
                        <p className="text-2xl font-extrabold leading-6">EST Meknès</p>
                        <p className="text-blue-100 text-sm mt-1">Administration</p>
                      </div>
                    </div>

                    <nav className="space-y-1.5 overflow-y-auto pr-1">
                      {adminMenu.map((item) => {
                        const Icon = item.icon;
                        const active = adminTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setAdminTab(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left font-semibold transition-colors ${
                              active
                                ? 'bg-white/15 text-white border-l-4 border-amber-300'
                                : 'text-blue-100 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {item.label}
                          </button>
                        );
                      })}
                    </nav>

                    <button
                      onClick={handleLogout}
                      className="mt-auto flex items-center gap-2 px-3 py-3 rounded-xl text-blue-100 hover:bg-white/10 hover:text-white font-semibold"
                    >
                      <LogOut className="w-4 h-4" /> Déconnexion
                    </button>
                  </aside>

                  <section className="bg-[#eef1f7] p-4 md:p-8 overflow-y-auto overflow-x-hidden min-w-0">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between md:flex-nowrap gap-4 mb-6">
                      <div>
                        <h2 className="text-3xl font-extrabold text-[#0b3a67]">{adminMeta[adminTab].title}</h2>
                        <p className="text-slate-500 mt-2">{adminMeta[adminTab].subtitle}</p>
                      </div>
                      {adminTab === 'modules' && (
                        <button
                          onClick={() => setAdminTab('dashboard')}
                          className="bg-[#f3f6fb] text-[#0b3a67] px-6 py-3 rounded-xl font-bold border border-[#a9bbcd] hover:bg-white shrink-0 w-full md:w-auto"
                        >
                          Retour
                        </button>
                      )}
                      {adminMeta[adminTab].ctaLabel && (
                        <button
                          onClick={() => {
                            if (adminTab === 'enseignants') {
                              setEditingTeacherId(null);
                              setTeacherForm({ name: '', email: '', phone: '', department: '' });
                              setShowTeacherForm(true);
                            } else if (adminTab === 'semestres') {
                              setShowAddCourse((prev) => {
                                const next = !prev;
                                if (!next) {
                                  setEditingScheduleCourseId(null);
                                  setCourseSubject('');
                                  setCourseProf('');
                                  setCourseRoom('Amphi A');
                                  setCourseTime('08:30 - 10:30');
                                  setCourseType('Cours');
                                }
                                return next;
                              });
                            } else if (adminTab === 'documents') {
                              fileInputRef.current?.click();
                            } else if (adminTab === 'filieres') {
                              showToast('Remplissez le formulaire pour ajouter une filière', 'info');
                            }
                          }}
                          className="bg-[#0b3a67] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#0a3159] shadow shrink-0 w-full md:w-auto"
                        >
                          {adminMeta[adminTab].ctaLabel}
                        </button>
                      )}
                    </div>

                    {adminTab === 'dashboard' && (
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                          {[
                            { label: 'Filières', value: filieres.length, icon: School },
                            { label: 'Documents', value: resources.length, icon: FolderOpen },
                            { label: 'Enseignants', value: teachers.length, icon: GraduationCap },
                            { label: 'Annonces', value: announcements.length, icon: Bell }
                          ].map((card) => (
                            <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-5">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-slate-500 font-medium">{card.label}</p>
                                <card.icon className="w-5 h-5 text-[#0b3a67]" />
                              </div>
                              <p className="text-3xl font-black text-[#0b3a67]">{card.value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                          <div className="bg-white rounded-2xl border border-slate-200 p-5">
                            <h3 className="font-bold text-slate-800 mb-4">Modules les plus alimentés</h3>
                            <div className="space-y-2">
                              {moduleOverview.slice(0, 5).map((moduleItem) => (
                                <div key={moduleItem.moduleName} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                  <div>
                                    <p className="font-semibold text-slate-700 text-sm">{moduleItem.moduleName}</p>
                                    <p className="text-xs text-slate-400">{moduleItem.profCount} enseignants</p>
                                  </div>
                                  <span className="text-xs px-2.5 py-1 rounded-full bg-[#0b3a67] text-white font-bold">{moduleItem.docs} docs</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-white rounded-2xl border border-slate-200 p-5">
                            <h3 className="font-bold text-slate-800 mb-4">Raccourcis</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <button onClick={() => setAdminTab('documents')} className="p-4 text-left rounded-xl border border-slate-200 hover:bg-slate-50">
                                <p className="font-semibold text-slate-700">Publier un document</p>
                                <p className="text-xs text-slate-400 mt-1">Ajouter un nouveau PDF</p>
                              </button>
                              <button onClick={() => setAdminTab('enseignants')} className="p-4 text-left rounded-xl border border-slate-200 hover:bg-slate-50">
                                <p className="font-semibold text-slate-700">Gérer les enseignants</p>
                                <p className="text-xs text-slate-400 mt-1">Ajouter ou modifier un profil</p>
                              </button>
                              <button onClick={() => setAdminTab('filieres')} className="p-4 text-left rounded-xl border border-slate-200 hover:bg-slate-50">
                                <p className="font-semibold text-slate-700">Gérer les filières</p>
                                <p className="text-xs text-slate-400 mt-1">Créer une nouvelle filière</p>
                              </button>
                              <button onClick={() => setAdminTab('semestres')} className="p-4 text-left rounded-xl border border-slate-200 hover:bg-slate-50">
                                <p className="font-semibold text-slate-700">Modifier un emploi</p>
                                <p className="text-xs text-slate-400 mt-1">Planifier les cours de la semaine</p>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {adminTab === 'filieres' && (
                      <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5">
                          <h3 className="font-bold text-slate-800 mb-4">Ajouter une filière</h3>
                          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px_160px] gap-3">
                            <input
                              type="text"
                              value={newFiliereName}
                              onChange={(e) => setNewFiliereName(e.target.value)}
                              placeholder="Nom de la filière"
                              className="px-4 py-3 rounded-xl border border-slate-200"
                            />
                            <input
                              type="text"
                              value={newFiliereCode}
                              onChange={(e) => setNewFiliereCode(e.target.value)}
                              placeholder="Code"
                              className="px-4 py-3 rounded-xl border border-slate-200"
                            />
                            <button onClick={handleAddFiliere} className="bg-[#0b3a67] text-white px-4 py-3 rounded-xl font-bold hover:bg-[#0a3159]">
                              Ajouter
                            </button>
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-100 text-slate-700">
                                <tr>
                                  <th className="text-left px-5 py-3 font-bold">Nom</th>
                                  <th className="text-left px-5 py-3 font-bold">Code</th>
                                  <th className="text-left px-5 py-3 font-bold">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filieres.map((filiere) => (
                                  <tr key={filiere.id} className="border-t border-slate-100">
                                    <td className="px-5 py-3 font-semibold text-slate-800 break-words max-w-[430px]">{filiere.name}</td>
                                    <td className="px-5 py-3 text-slate-500">{filiere.code}</td>
                                    <td className="px-5 py-3">
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => {
                                            setSelectedFiliere(filiere.id);
                                            setAdminTab('semestres');
                                          }}
                                          className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50"
                                        >
                                          Voir
                                        </button>
                                        <button
                                          onClick={() => handleDeleteFiliere(filiere.id)}
                                          className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                          Supprimer
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {adminTab === 'semestres' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {['S1', 'S2', 'S3', 'S4'].map((semester) => (
                            <div key={semester} className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center">
                              <p className="text-sm text-slate-500">Semestre</p>
                              <p className="font-black text-xl text-[#0b3a67]">{semester}</p>
                            </div>
                          ))}
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-1 min-w-0">
                              <select
                                value={selectedFiliere}
                                onChange={(e) => setSelectedFiliere(e.target.value)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm w-full sm:flex-1 min-w-0"
                              >
                                <option value="">Choisir une filière</option>
                                {filieres.map((filiere) => (
                                  <option key={filiere.id} value={filiere.id}>{filiere.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={handleSaveSchedule}
                                className="bg-[#0b3a67] text-white px-4 py-2.5 rounded-xl font-bold hover:bg-[#0a3159] flex items-center justify-center gap-2 w-full sm:w-auto shrink-0"
                              >
                                <Save className="w-4 h-4" /> Sauvegarder
                              </button>
                            </div>
                          </div>

                          {!selectedFiliere ? (
                            <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                              Choisissez une filière pour modifier son emploi du temps.
                            </div>
                          ) : (
                            <>
                              <div className="flex gap-2 overflow-x-auto pb-2">
                                {DAYS.map((day) => (
                                  <button
                                    key={day}
                                    onClick={() => setSelectedDay(day)}
                                    className={`px-4 py-2 rounded-xl font-semibold whitespace-nowrap ${selectedDay === day ? 'bg-[#0b3a67] text-white' : 'bg-slate-100 text-slate-600'}`}
                                  >
                                    {day}
                                  </button>
                                ))}
                              </div>

                              <AnimatePresence>
                                {showAddCourse && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-4"
                                  >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <select value={courseSubject} onChange={(e) => setCourseSubject(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white">
                                        <option value="">Sélectionner la matière</option>
                                        {MODULES.map((moduleItem) => (<option key={moduleItem} value={moduleItem}>{moduleItem}</option>))}
                                      </select>
                                      <select value={courseProf} onChange={(e) => setCourseProf(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white">
                                        <option value="">Sélectionner le professeur</option>
                                        {PROFESSORS.map((professor) => (<option key={professor} value={professor}>{professor}</option>))}
                                      </select>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <select value={courseTime} onChange={(e) => setCourseTime(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white">
                                        {TIME_SLOTS.map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
                                      </select>
                                      <select value={courseRoom} onChange={(e) => setCourseRoom(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white">
                                        {ROOMS.map((room) => (<option key={room} value={room}>{room}</option>))}
                                      </select>
                                      <select value={courseType} onChange={(e) => setCourseType(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white">
                                        {['Cours', 'TD', 'TP', 'TP (Groupe)'].map((typeOption) => (
                                          <option key={typeOption} value={typeOption}>{typeOption}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <button
                                      onClick={editingScheduleCourseId ? handleUpdateCourse : handleAddCourse}
                                      className="w-full bg-[#0b3a67] text-white py-2.5 rounded-xl font-bold hover:bg-[#0a3159]"
                                    >
                                      {editingScheduleCourseId ? 'Modifier ce cours' : 'Ajouter ce cours'}
                                    </button>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              <div className="space-y-2">
                                {editingSchedule.find((daySchedule) => daySchedule.day === selectedDay)?.courses.map((course) => (
                                  <div key={course.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div>
                                      <p className="font-bold text-slate-800">{course.subject}</p>
                                      <p className="text-sm text-slate-500">{course.prof} • {course.room}</p>
                                      <p className="text-xs text-[#0b3a67] font-semibold mt-1">{course.time} • {course.type}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => handleStartEditCourse(course)} className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50">Modifier</button>
                                      <button onClick={() => handleDeleteCourse(course.id)} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Supprimer</button>
                                    </div>
                                  </div>
                                ))}
                                {(!editingSchedule.find((daySchedule) => daySchedule.day === selectedDay)?.courses || editingSchedule.find((daySchedule) => daySchedule.day === selectedDay)?.courses.length === 0) && (
                                  <p className="text-center py-8 text-slate-400">Aucun cours pour {selectedDay}</p>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {adminTab === 'modules' && (
                      <div className="max-w-5xl space-y-3">
                        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
                          <form onSubmit={handleSaveModule} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[#0b3a67] font-bold text-base mb-1.5">Nom du module</label>
                                <input
                                  type="text"
                                  value={moduleForm.name}
                                  onChange={(e) => setModuleForm((prev) => ({ ...prev, name: e.target.value }))}
                                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0b3a67]/20"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[#0b3a67] font-bold text-base mb-1.5">Code</label>
                                <input
                                  type="text"
                                  value={moduleForm.code}
                                  onChange={(e) => setModuleForm((prev) => ({ ...prev, code: e.target.value }))}
                                  placeholder="Ex: M101"
                                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0b3a67]/20"
                                  required
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[#0b3a67] font-bold text-base mb-1.5">Filière</label>
                                <select
                                  value={moduleForm.filiereId}
                                  onChange={(e) => setModuleForm((prev) => ({ ...prev, filiereId: e.target.value }))}
                                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0b3a67]/20"
                                  required
                                >
                                  <option value="">Sélectionner une filière</option>
                                  {filieres.map((filiere) => (
                                    <option key={filiere.id} value={filiere.id}>{filiere.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[#0b3a67] font-bold text-base mb-1.5">Semestre</label>
                                <select
                                  value={moduleForm.semester}
                                  onChange={(e) => setModuleForm((prev) => ({ ...prev, semester: e.target.value }))}
                                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0b3a67]/20"
                                  required
                                >
                                  <option value="">Sélectionner un semestre</option>
                                  {['S1', 'S2', 'S3', 'S4'].map((semester) => (
                                    <option key={semester} value={semester}>{semester}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[#0b3a67] font-bold text-base mb-1.5">Enseignant</label>
                              <select
                                value={moduleForm.teacherId}
                                onChange={(e) => setModuleForm((prev) => ({ ...prev, teacherId: e.target.value }))}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0b3a67]/20"
                              >
                                <option value="">Aucun enseignant</option>
                                {teachers.map((teacher) => (
                                  <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[#0b3a67] font-bold text-base mb-1.5">Description</label>
                              <textarea
                                value={moduleForm.description}
                                onChange={(e) => setModuleForm((prev) => ({ ...prev, description: e.target.value }))}
                                rows={4}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0b3a67]/20 resize-y"
                              />
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-0.5">
                              <button
                                type="submit"
                                className="bg-[#0b3a67] text-white px-8 py-2.5 rounded-xl font-bold hover:bg-[#0a3159]"
                              >
                                Enregistrer
                              </button>
                              <button
                                type="button"
                                onClick={resetModuleForm}
                                className="px-8 py-2.5 rounded-xl border border-[#8fa6be] text-[#0b3a67] font-bold hover:bg-[#f7f9fc]"
                              >
                                Annuler
                              </button>
                            </div>
                          </form>
                        </div>

                        {customModules.length > 0 && (
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-200">
                              <h3 className="font-bold text-slate-800">Modules ajoutés ({customModules.length})</h3>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-100 text-slate-700">
                                  <tr>
                                    <th className="text-left px-5 py-3 font-bold">Module</th>
                                    <th className="text-left px-5 py-3 font-bold">Code</th>
                                    <th className="text-left px-5 py-3 font-bold">Filière</th>
                                    <th className="text-left px-5 py-3 font-bold">Semestre</th>
                                    <th className="text-left px-5 py-3 font-bold">Enseignant</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {customModules.map((moduleItem) => {
                                    const filiereName = filieres.find((filiere) => filiere.id === moduleItem.filiereId)?.name || 'Non définie';
                                    const teacherName = teachers.find((teacher) => teacher.id === moduleItem.teacherId)?.name || 'Aucun enseignant';
                                    return (
                                      <tr key={moduleItem.id} className="border-t border-slate-100">
                                        <td className="px-5 py-3 font-semibold text-slate-800">{moduleItem.name}</td>
                                        <td className="px-5 py-3 text-slate-600">{moduleItem.code}</td>
                                        <td className="px-5 py-3 text-slate-600">{filiereName}</td>
                                        <td className="px-5 py-3 text-slate-600">{moduleItem.semester}</td>
                                        <td className="px-5 py-3 text-slate-600">{teacherName}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {adminTab === 'enseignants' && (
                      <div className="space-y-4">
                        <AnimatePresence>
                          {showTeacherForm && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="bg-white rounded-2xl border border-slate-200 p-5"
                            >
                              <form onSubmit={handleSaveTeacher} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <input
                                  type="text"
                                  value={teacherForm.name}
                                  onChange={(e) => setTeacherForm((prev) => ({ ...prev, name: e.target.value }))}
                                  placeholder="Nom complet"
                                  className="px-4 py-3 rounded-xl border border-slate-200"
                                />
                                <input
                                  type="email"
                                  value={teacherForm.email}
                                  onChange={(e) => setTeacherForm((prev) => ({ ...prev, email: e.target.value }))}
                                  placeholder="Email"
                                  className="px-4 py-3 rounded-xl border border-slate-200"
                                />
                                <input
                                  type="text"
                                  value={teacherForm.phone}
                                  onChange={(e) => setTeacherForm((prev) => ({ ...prev, phone: e.target.value }))}
                                  placeholder="Téléphone"
                                  className="px-4 py-3 rounded-xl border border-slate-200"
                                />
                                <input
                                  type="text"
                                  value={teacherForm.department}
                                  onChange={(e) => setTeacherForm((prev) => ({ ...prev, department: e.target.value }))}
                                  placeholder="Département"
                                  className="px-4 py-3 rounded-xl border border-slate-200"
                                />
                                <div className="md:col-span-2 flex gap-2">
                                  <button type="submit" className="bg-[#0b3a67] text-white px-4 py-2.5 rounded-xl font-bold hover:bg-[#0a3159]">
                                    {editingTeacherId ? 'Mettre à jour' : 'Ajouter'}
                                  </button>
                                  <button type="button" onClick={resetTeacherForm} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
                                    Annuler
                                  </button>
                                </div>
                              </form>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-100 text-slate-700">
                                <tr>
                                  <th className="text-left px-5 py-3 font-bold">Nom</th>
                                  <th className="text-left px-5 py-3 font-bold">Email</th>
                                  <th className="text-left px-5 py-3 font-bold">Téléphone</th>
                                  <th className="text-left px-5 py-3 font-bold">Département</th>
                                  <th className="text-left px-5 py-3 font-bold">Modules</th>
                                  <th className="text-left px-5 py-3 font-bold">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {teachers.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                                      Aucun enseignant enregistré.
                                    </td>
                                  </tr>
                                )}
                                {teachers.map((teacher) => (
                                  <tr key={teacher.id} className="border-t border-slate-100">
                                    <td className="px-5 py-3 font-semibold text-slate-800">{teacher.name}</td>
                                    <td className="px-5 py-3 text-slate-600">{teacher.email}</td>
                                    <td className="px-5 py-3 text-slate-600">{teacher.phone}</td>
                                    <td className="px-5 py-3 text-slate-600">{teacher.department}</td>
                                    <td className="px-5 py-3 text-slate-600">{teacher.modules}</td>
                                    <td className="px-5 py-3">
                                      <div className="flex items-center gap-2">
                                        <button onClick={() => handleEditTeacher(teacher)} className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">Modifier</button>
                                        <button onClick={() => handleDeleteTeacher(teacher.id)} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50">Supprimer</button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {adminTab === 'documents' && (
                      <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5">
                          <form onSubmit={handlePublishResource} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="Titre du document"
                                className="px-4 py-3 rounded-xl border border-slate-200"
                                required
                              />
                              <select
                                value={newType}
                                onChange={(e) => setNewType(e.target.value as ResourceType)}
                                className="px-4 py-3 rounded-xl border border-slate-200 bg-white"
                              >
                                {['Cours', 'TD', 'TP', 'QCM', 'Ancien Examen'].map((typeOption) => (
                                  <option key={typeOption} value={typeOption}>{typeOption}</option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <select value={publishFiliere} onChange={(e) => setPublishFiliere(e.target.value)} className="px-4 py-3 rounded-xl border border-slate-200 bg-white" required>
                                <option value="">Filière concernée</option>
                                {filieres.map((filiere) => (<option key={filiere.id} value={filiere.id}>{filiere.name}</option>))}
                              </select>
                              <select value={newSubject} onChange={(e) => setNewSubject(e.target.value)} className="px-4 py-3 rounded-xl border border-slate-200 bg-white" required>
                                <option value="">Module</option>
                                {MODULES.map((moduleItem) => (<option key={moduleItem} value={moduleItem}>{moduleItem}</option>))}
                              </select>
                              <select value={newProfessor} onChange={(e) => setNewProfessor(e.target.value)} className="px-4 py-3 rounded-xl border border-slate-200 bg-white" required>
                                <option value="">Professeur</option>
                                {PROFESSORS.map((professor) => (<option key={professor} value={professor}>{professor}</option>))}
                              </select>
                            </div>

                            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center cursor-pointer hover:border-[#0b3a67] hover:bg-slate-50">
                              <CloudUpload className="w-9 h-9 text-slate-400 mx-auto mb-2" />
                              <p className="text-slate-600 font-medium">Cliquer pour sélectionner un PDF</p>
                              {selectedPdf && <p className="text-xs text-emerald-600 mt-2 font-semibold">{selectedPdf.name}</p>}
                            </div>
                            <input ref={fileInputRef} type="file" accept=".pdf" onChange={handlePdfSelect} className="hidden" />

                            {isUploading && (
                              <div className="bg-slate-100 rounded-lg overflow-hidden">
                                <div className="bg-[#0b3a67] h-2 transition-all" style={{ width: `${uploadProgress}%` }} />
                                <p className="text-xs text-center py-2 text-slate-500">Upload en cours... {uploadProgress}%</p>
                              </div>
                            )}

                            <button type="submit" disabled={isUploading || !selectedPdf} className="bg-[#0b3a67] text-white px-5 py-3 rounded-xl font-bold hover:bg-[#0a3159] disabled:opacity-50">
                              {isUploading ? 'Publication...' : 'Publier le document'}
                            </button>
                          </form>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-100 text-slate-700">
                                <tr>
                                  <th className="text-left px-5 py-3 font-bold">Titre</th>
                                  <th className="text-left px-5 py-3 font-bold">Type</th>
                                  <th className="text-left px-5 py-3 font-bold">Filière</th>
                                  <th className="text-left px-5 py-3 font-bold">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {resources.map((resource) => (
                                  <tr key={resource.id} className="border-t border-slate-100">
                                    <td className="px-5 py-3 font-semibold text-slate-800">{resource.title}</td>
                                    <td className="px-5 py-3 text-slate-600">{resource.type}</td>
                                    <td className="px-5 py-3 text-slate-600">{resource.filiereName || 'Non définie'}</td>
                                    <td className="px-5 py-3">
                                      <button onClick={() => handleDeleteResource(resource)} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                                        Supprimer
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {adminTab === 'utilisateurs' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <p className="text-slate-500 text-sm">Comptes affichés</p>
                            <p className="text-2xl font-black text-[#0b3a67] mt-1">{uniqueAdminUsers.length}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <p className="text-slate-500 text-sm">Admins</p>
                            <p className="text-2xl font-black text-[#0b3a67] mt-1">{uniqueAdminUsers.filter((user) => user.role === 'Administrateur').length}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <p className="text-slate-500 text-sm">Session active</p>
                            <p className="text-2xl font-black text-[#0b3a67] mt-1">1</p>
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-100 text-slate-700">
                                <tr>
                                  <th className="text-left px-5 py-3 font-bold">Nom</th>
                                  <th className="text-left px-5 py-3 font-bold">Email</th>
                                  <th className="text-left px-5 py-3 font-bold">Rôle</th>
                                  <th className="text-left px-5 py-3 font-bold">Statut</th>
                                </tr>
                              </thead>
                              <tbody>
                                {uniqueAdminUsers.map((adminUser) => (
                                  <tr key={adminUser.id} className="border-t border-slate-100">
                                    <td className="px-5 py-3 font-semibold text-slate-800">{adminUser.name}</td>
                                    <td className="px-5 py-3 text-slate-600">{adminUser.email}</td>
                                    <td className="px-5 py-3 text-slate-600">{adminUser.role}</td>
                                    <td className="px-5 py-3">
                                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${adminUser.status === 'Connecté' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {adminUser.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </motion.div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      {!isAdminWorkspace && (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 z-40 safe-area-bottom">
        <div className="flex items-center justify-around">
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'dashboard' ? 'text-emerald-600' : 'text-slate-400'}`}>
            <TrendingUp className="w-6 h-6" />
            <span className="text-[10px] font-medium mt-1">Accueil</span>
          </button>
          <button onClick={() => { setActiveTab('resources'); setResourceFilter('Tous'); }} className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'resources' ? 'text-emerald-600' : 'text-slate-400'}`}>
            <BookMarked className="w-6 h-6" />
            <span className="text-[10px] font-medium mt-1">Ressources</span>
          </button>
          <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'schedule' ? 'text-emerald-600' : 'text-slate-400'}`}>
            <Calendar className="w-6 h-6" />
            <span className="text-[10px] font-medium mt-1">Emploi</span>
          </button>
          <button onClick={() => setActiveTab('announcements')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'announcements' ? 'text-emerald-600' : 'text-slate-400'}`}>
            <Bell className="w-6 h-6" />
            <span className="text-[10px] font-medium mt-1">Annonces</span>
          </button>
          {isAdmin && (
            <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'admin' ? 'text-slate-800' : 'text-slate-400'}`}>
              <Settings className="w-6 h-6" />
              <span className="text-[10px] font-medium mt-1">Admin</span>
            </button>
          )}
        </div>
      </nav>
      )}

      {/* Footer */}
      {!isAdminWorkspace && (
        <footer className="mt-auto bg-[#0b3a67] text-white border-t border-[#1a4e7f]">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-7">
            <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr_1fr] gap-5 md:gap-6">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <img
                    src="/images/est-logo.png"
                    alt="EST Meknès"
                    className="h-7 w-auto object-contain rounded-sm bg-white p-1"
                  />
                  <h3 className="text-lg md:text-2xl font-black tracking-tight">Développer par :</h3>
                </div>

                <div className="space-y-4">
                  {footerDevelopers.map((developer) => (
                    <div key={developer.name} className="flex items-start gap-3">
                      <img
                        src={developer.imageUrl}
                        alt={developer.name}
                        className="h-14 w-14 md:h-16 md:w-16 rounded-full object-cover border-2 border-white/90 shrink-0"
                      />
                      <div className="leading-snug text-white/95 space-y-1">
                        <button
                          type="button"
                          onClick={() => setActiveFooterProfile(developer)}
                          className="text-base md:text-xl font-black underline underline-offset-2 decoration-white/70 hover:text-white text-left"
                        >
                          {developer.name}
                        </button>
                        <p className="text-sm md:text-base font-black">contact :</p>
                        <p className="text-xs md:text-sm break-all">Académique : {developer.academicEmail}</p>
                        <p className="text-xs md:text-sm break-all">Personnel : {developer.personalEmail}</p>
                        <p className="text-xs md:text-sm">tel : {developer.phone}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="lg:border-l lg:border-white/70 lg:pl-6">
                <h4 className="text-lg md:text-2xl font-black mb-3">Navigation</h4>
                <ul className="space-y-2 text-sm md:text-xl leading-tight">
                  {footerNavigation.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={(event) => handleFooterNavigation(item.action, event.currentTarget)}
                        className="text-left text-white/90 hover:text-white transition-colors"
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="lg:border-l lg:border-white/70 lg:pl-6">
                <h4 className="text-lg md:text-2xl font-black mb-3">Contact</h4>
                <div className="space-y-2 text-xs md:text-lg text-white/90 leading-snug">
                  <p className="break-all">Email : estm@est-umi.ac.ma</p>
                  <p>Tél 1 : +212 5 35 46 70 85</p>
                  <p>Tél 2 : +212 5 35 46 70 84</p>
                </div>
              </section>
            </div>
          </div>

          <div className="border-t border-white/10 bg-[#09345d] py-2.5">
            <div className="max-w-7xl mx-auto px-4 md:px-8">
              <p className="text-white/80 text-xs md:text-sm">© 2026 ESTM Portal - Tous droits réservés.</p>
            </div>
          </div>
        </footer>
      )}

      <AnimatePresence>
        {activeFooterProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm p-3 md:p-5 flex items-center justify-center"
            onClick={closeFooterProfileModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-[32rem] md:max-w-[34rem] rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 md:p-5"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Profil ${activeFooterProfile.name}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 md:gap-4">
                  <img
                    src={activeFooterProfile.imageUrl}
                    alt={activeFooterProfile.name}
                    className="h-16 w-16 md:h-20 md:w-20 rounded-full object-cover border-2 border-slate-100"
                  />
                  <div>
                    <h3 className="text-xl md:text-3xl font-black text-[#0b3a67] leading-tight">{activeFooterProfile.name}</h3>
                    <p className="text-slate-500 text-sm md:text-xl mt-1">{activeFooterProfile.role}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeFooterProfileModal}
                  className="h-10 w-10 md:h-11 md:w-11 rounded-xl border border-slate-200 text-[#0b3a67] hover:bg-slate-100 flex items-center justify-center"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 md:mt-5 space-y-2 text-slate-700 text-sm md:text-base leading-snug">
                <p><span className="font-black text-slate-800">Académique :</span> {activeFooterProfile.academicEmail}</p>
                <p><span className="font-black text-slate-800">Personnel :</span> {activeFooterProfile.personalEmail}</p>
                <p><span className="font-black text-slate-800">Téléphone :</span> {activeFooterProfile.phone}</p>
              </div>

              <a
                href={activeFooterProfile.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 md:mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0b3a67] px-3 py-2 text-white text-sm md:text-base font-bold hover:bg-[#0a3159]"
              >
                <span className="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-md border border-white/50 text-xs md:text-sm font-black">in</span>
                Voir LinkedIn
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
