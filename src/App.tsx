import { useEffect, useState, useMemo } from "react";
import {
  Users,
  LogOut,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Edit2,
  Save,
  X,
  Search,
  BarChart3,
  Lock,
  Crown,
  User,
  DollarSign,
  TrendingUp,
  Percent,
  Wallet,
  CreditCard,
} from "lucide-react";

import {
  runTransaction,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  DocumentData,
} from "firebase/firestore";

import { db } from "./firebase";

// ====== TIPOS ======
type Role = "owner" | "staff";

type User = {
  id: string;
  name: string;
  pin: string;
  role: Role;
  color: string;
  icon: "crown" | "user";
  commissionPct: number;
  active: boolean;
};

type PaymentMethod = "cash" | "transfer";

type Service = {
  id: string;
  date: string;
  client: string;
  service: string;
  cost: number;
  userId: string;
  userName: string;
  paymentMethod: PaymentMethod;
  commissionPct: number;
  deleted?: boolean;
};

type Expense = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  deleted?: boolean;
};

type Toast = { type: "success" | "error" | "info"; message: string };

type OwnerFilters = {
  dateFrom: string;
  dateTo: string;
  paymentMethod: "all" | PaymentMethod;
  includeDeleted: boolean;
  search: string;
};

type Filters = {
  search: string;
  dateFrom: string;
  dateTo: string;
};

// ====== HELPER ======
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const SalonApp = () => {
  // ====== Estado ======
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showPin, setShowPin] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<Toast | null>(null);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ search: "", dateFrom: "", dateTo: "" });
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const [ownerFilters, setOwnerFilters] = useState<OwnerFilters>({
    dateFrom: "",
    dateTo: "",
    paymentMethod: "all",
    includeDeleted: false,
    search: "",
  });

  // ====== Helpers ======
  const normalizeUser = (u: DocumentData & { id: string }): User => {
    const commissionPct =
      typeof u.commissionPct === "number"
        ? clamp(u.commissionPct, 0, 100)
        : u.commissionPct != null
        ? clamp(parseFloat(u.commissionPct) || 0, 0, 100)
        : u.role === "owner"
        ? 0
        : 35;

    return {
      id: u.id,
      name: u.name ?? "Sin nombre",
      pin: String(u.pin ?? ""),
      role: u.role ?? "staff",
      color: u.color ?? "from-teal-500 to-emerald-600",
      icon: u.icon ?? "user",
      commissionPct,
      active: u.active !== false,
    };
  };

  const getUserById = (id: string): User | undefined => users.find((u) => u.id === id);

  const getCommissionPctForService = (s: Service): number => {
    if (typeof s.commissionPct === "number") return clamp(s.commissionPct, 0, 100);
    const u = getUserById(s.userId);
    return clamp(u?.commissionPct ?? 0, 0, 100);
  };

  const calcCommissionAmount = (s: Service): number => {
    const pct = getCommissionPctForService(s);
    const cost = Number(s.cost) || 0;
    return (cost * pct) / 100;
  };

  // ====== Inicializar usuarios base (solo una vez) ======
  const initializeDefaultUsers = async () => {
    try {
      await runTransaction(db, async (tx) => {
        const metaRef = doc(db, "meta", "app");
        const metaSnap = await tx.get(metaRef);

        if (metaSnap.exists() && metaSnap.data()?.seeded) return;

        const defaultUsers = [
          {
            name: "Principal",
            pin: "2773",
            role: "owner",
            color: "from-purple-500 to-indigo-600",
            icon: "crown",
            commissionPct: 0,
            active: true,
            createdAt: serverTimestamp(),
          },
          {
            name: "Emily",
            pin: "6578",
            role: "staff",
            color: "from-pink-500 to-rose-600",
            icon: "user",
            commissionPct: 35,
            active: true,
            createdAt: serverTimestamp(),
          },
          {
            name: "Damaris",
            pin: "2831",
            role: "staff",
            color: "from-blue-500 to-cyan-600",
            icon: "user",
            commissionPct: 35,
            active: true,
            createdAt: serverTimestamp(),
          },
        ];

        defaultUsers.forEach((u) => {
          const newRef = doc(collection(db, "users"));
          tx.set(newRef, u);
        });

        tx.set(metaRef, { seeded: true, seededAt: serverTimestamp() }, { merge: true });
      });

      setInitialized(true);
    } catch (error) {
      console.error("Error inicializando usuarios:", error);
      showNotification("Error al inicializar", "error");
      setInitialized(true);
    }
  };

  // ====== Cargar datos en tiempo real ======
  useEffect(() => {
    initializeDefaultUsers();
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const q = query(collection(db, "users"), orderBy("name", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => normalizeUser({ id: d.id, ...d.data() }));
        setUsers(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error cargando usuarios:", error);
        showNotification("Error cargando usuarios", "error");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [initialized]);

  useEffect(() => {
    if (!initialized) return;

    const q = query(collection(db, "services"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Service));
        setServices(data);
      },
      (error) => {
        console.error("Error cargando servicios:", error);
        showNotification("Error cargando servicios", "error");
      }
    );

    return () => unsub();
  }, [initialized]);

  useEffect(() => {
    if (!initialized) return;

    const q = query(collection(db, "expenses"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
        setExpenses(data);
      },
      (error) => {
        console.error("Error cargando gastos:", error);
        showNotification("Error cargando gastos", "error");
      }
    );

    return () => unsub();
  }, [initialized]);

  // ====== Notificaciones ======
  const showNotification = (message: string, type: Toast["type"] = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 2800);
  };

  const Notification = () => {
    if (!notification) return null;
    const bg = notification.type === "success" ? "bg-green-500" : "bg-red-500";
    return (
      <div className={`fixed top-4 right-4 ${bg} text-white px-6 py-3 rounded-lg shadow-lg z-50`}>
        {notification.message}
      </div>
    );
  };

  // ====== CSV ======
  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
      showNotification("No hay datos para exportar", "error");
      return;
    }
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((row) => Object.values(row).join(",")).join("\n");
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    showNotification("Reporte descargado");
  };

  // ====== Login ======
  const LoginScreen = () => {
    const [pins, setPins] = useState<Record<string, string>>({});

    const handlePinChange = (userId: string, value: string) => {
      const numericValue = value.replace(/\D/g, "").slice(0, 4);
      setPins({ ...pins, [userId]: numericValue });
    };

    const handleLogin = (userId: string) => {
      const user = users.find((u) => u.id === userId);
      if (user && pins[userId] === user.pin) {
        setCurrentUser(user);
        setPins({});
        showNotification(`¡Bienvenida ${user.name}!`);
      } else {
        showNotification("PIN incorrecto", "error");
        setPins({ ...pins, [userId]: "" });
      }
    };

    const handleKeyPress = (e: React.KeyboardEvent, userId: string) => {
      if (e.key === "Enter" && (pins[userId] || "").length === 4) handleLogin(userId);
    };

    const activeUsers = users.filter((u) => u.active);

    if (loading) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 p-4 rounded-3xl shadow-2xl mb-6 animate-pulse">
              <Users className="text-white" size={56} />
            </div>
            <p className="text-gray-600 text-lg font-medium">Cargando...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl">
          <div className="text-center mb-12">
            <div className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 p-4 rounded-3xl shadow-2xl mb-6">
              <Users className="text-white" size={56} />
            </div>
            <h1 className="text-5xl font-black text-gray-800 mb-3 tracking-tight">Beauty Center</h1>
            <p className="text-gray-500 text-lg font-medium">Sistema de Gestión Profesional</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {activeUsers.map((user) => (
              <div
                key={user.id}
                className="bg-white rounded-3xl shadow-xl p-8 hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-2 border-gray-100"
              >
                <div className="text-center mb-6">
                  <div
                    className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br ${user.color} shadow-lg mb-4`}
                  >
                    {user.icon === "crown" ? (
                      <Crown className="text-white" size={40} />
                    ) : (
                      <User className="text-white" size={40} />
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-1">{user.name}</h3>
                  {user.role === "owner" && (
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold uppercase">
                      Administradora
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2 ml-1 uppercase tracking-wider">
                      Ingresa tu PIN
                    </label>
                    <div className="relative">
                      <input
                        type={showPin[user.id] ? "text" : "password"}
                        value={pins[user.id] || ""}
                        onChange={(e) => handlePinChange(user.id, e.target.value)}
                        onKeyPress={(e) => handleKeyPress(e, user.id)}
                        maxLength={4}
                        placeholder="••••"
                        className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:border-purple-500 focus:bg-white focus:outline-none text-3xl text-center tracking-[0.5em] transition-all font-bold"
                      />
                      <button
                        onClick={() => setShowPin({ ...showPin, [user.id]: !showPin[user.id] })}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-500 transition-colors"
                      >
                        {showPin[user.id] ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => handleLogin(user.id)}
                    disabled={!pins[user.id] || pins[user.id].length < 4}
                    className={`w-full bg-gradient-to-r ${user.color} text-white py-4 rounded-2xl font-bold text-lg hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                  >
                    <Lock size={20} />
                    Entrar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8 text-gray-400 text-sm">
            <p className="flex items-center justify-center gap-2">
              <Lock size={16} />
              Sistema seguro con autenticación por PIN personal
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ====== Staff ======
  const StaffScreen = () => {
    const [newService, setNewService] = useState({
      date: new Date().toISOString().split("T")[0],
      client: "",
      service: "",
      cost: "",
      paymentMethod: "cash" as PaymentMethod,
    });

    const userServices = services.filter((s) => s.userId === currentUser?.id && !s.deleted);

    const filteredServices = userServices.filter((s) => {
      const matchSearch =
        !filters.search ||
        s.client.toLowerCase().includes(filters.search.toLowerCase()) ||
        s.service.toLowerCase().includes(filters.search.toLowerCase());
      const matchDateFrom = !filters.dateFrom || s.date >= filters.dateFrom;
      const matchDateTo = !filters.dateTo || s.date <= filters.dateTo;
      return matchSearch && matchDateFrom && matchDateTo;
    });

    const addService = async () => {
      if (!newService.client || !newService.service || !newService.cost) {
        showNotification("Completa todos los campos", "error");
        return;
      }

      const cost = parseFloat(newService.cost);
      if (!Number.isFinite(cost) || cost <= 0) {
        showNotification("Costo inválido", "error");
        return;
      }

      const commissionPct = clamp(Number(currentUser?.commissionPct || 0), 0, 100);

      try {
        await addDoc(collection(db, "services"), {
          userId: currentUser?.id,
          userName: currentUser?.name,
          date: newService.date,
          client: newService.client.trim(),
          service: newService.service.trim(),
          cost,
          commissionPct,
          paymentMethod: newService.paymentMethod,
          deleted: false,
          timestamp: serverTimestamp(),
        });

        setNewService({
          date: new Date().toISOString().split("T")[0],
          client: "",
          service: "",
          cost: "",
          paymentMethod: "cash",
        });
        showNotification("Servicio agregado");
      } catch (error) {
        console.error("Error agregando servicio:", error);
        showNotification("Error al agregar servicio", "error");
      }
    };

    const updateService = async (id: string, updated: Partial<Service>) => {
      try {
        await updateDoc(doc(db, "services", id), updated);
        setEditingService(null);
        showNotification("Servicio actualizado");
      } catch (error) {
        console.error("Error actualizando servicio:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    const softDeleteService = async (id: string) => {
      if (!window.confirm("¿Eliminar este servicio? (Se guardará como historial)")) return;
      try {
        await updateDoc(doc(db, "services", id), {
          deleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: currentUser?.id,
        });
        showNotification("Servicio eliminado (historial)");
      } catch (error) {
        console.error("Error eliminando servicio:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    const totalToday = userServices
      .filter((s) => s.date === new Date().toISOString().split("T")[0])
      .reduce((sum, s) => sum + s.cost, 0);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className={`bg-gradient-to-r ${currentUser?.color} text-white p-6 shadow-lg`}>
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Hola, {currentUser?.name}</h1>
              <p className="text-white/80">Registra tus servicios</p>
            </div>
            <button
              onClick={() => {
                setCurrentUser(null);
                showNotification("Sesión cerrada");
              }}
              className="flex items-center gap-2 bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-lg hover:bg-white/30 transition shadow-md border border-white/30"
            >
              <LogOut size={20} />
              Salir
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6">
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus size={24} className="text-pink-500" />
              Agregar Nuevo Servicio
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <input
                type="date"
                value={newService.date}
                onChange={(e) => setNewService({ ...newService, date: e.target.value })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none transition"
              />
              <input
                type="text"
                placeholder="Nombre del cliente"
                value={newService.client}
                onChange={(e) => setNewService({ ...newService, client: e.target.value })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none transition"
              />
              <input
                type="text"
                placeholder="Servicio realizado"
                value={newService.service}
                onChange={(e) => setNewService({ ...newService, service: e.target.value })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none transition"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Costo $"
                value={newService.cost}
                onChange={(e) => setNewService({ ...newService, cost: e.target.value })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none transition"
              />

              <select
                value={newService.paymentMethod}
                onChange={(e) => setNewService({ ...newService, paymentMethod: e.target.value as PaymentMethod })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none transition"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </select>

              <button
                onClick={addService}
                className={`bg-gradient-to-r ${currentUser?.color} text-white px-6 py-2 rounded-lg hover:shadow-lg transition font-semibold`}
              >
                Agregar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-green-400 to-green-600 text-white rounded-xl shadow-lg p-6">
              <h3 className="text-sm font-semibold mb-2 opacity-90">Total Hoy</h3>
              <p className="text-3xl font-bold">${totalToday.toFixed(2)}</p>
              <p className="text-green-100 text-sm mt-1">
                {userServices.filter((s) => s.date === new Date().toISOString().split("T")[0]).length} servicios
              </p>
            </div>
            <div className="bg-gradient-to-br from-blue-400 to-blue-600 text-white rounded-xl shadow-lg p-6">
              <h3 className="text-sm font-semibold mb-2 opacity-90">Servicios</h3>
              <p className="text-3xl font-bold">{userServices.length}</p>
              <p className="text-blue-100 text-sm mt-1">activos</p>
            </div>
            <div className="bg-gradient-to-br from-purple-400 to-purple-600 text-white rounded-xl shadow-lg p-6">
              <h3 className="text-sm font-semibold mb-2 opacity-90">Mi Perfil</h3>
              <p className="text-2xl font-bold">{currentUser?.name}</p>
              <p className="text-purple-100 text-sm mt-1">Personal</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Buscar cliente o servicio..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none"
                />
              </div>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none"
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none"
              />
              <button
                onClick={() => setFilters({ search: "", dateFrom: "", dateTo: "" })}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">Mis Servicios</h2>
              <button
                onClick={() => exportToCSV(filteredServices, "mis_servicios")}
                className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition text-sm"
              >
                <Download size={18} />
                Exportar CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Fecha</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Cliente</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Servicio</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Pago</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Costo</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No hay servicios
                      </td>
                    </tr>
                  ) : (
                    filteredServices
                      .slice()
                      .reverse()
                      .map((service) => {
                        const isEditing = editingService === service.id;
                        let editedService = { ...service };

                        return (
                          <tr key={service.id} className="border-b hover:bg-gray-50 transition">
                            {isEditing ? (
                              <>
                                <td className="px-6 py-4">
                                  <input
                                    type="date"
                                    defaultValue={service.date}
                                    onChange={(e) => (editedService.date = e.target.value)}
                                    className="px-2 py-1 border rounded"
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <input
                                    type="text"
                                    defaultValue={service.client}
                                    onChange={(e) => (editedService.client = e.target.value)}
                                    className="px-2 py-1 border rounded w-full"
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <input
                                    type="text"
                                    defaultValue={service.service}
                                    onChange={(e) => (editedService.service = e.target.value)}
                                    className="px-2 py-1 border rounded w-full"
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <select
                                    defaultValue={service.paymentMethod || "cash"}
                                    onChange={(e) => (editedService.paymentMethod = e.target.value as PaymentMethod)}
                                    className="px-2 py-1 border rounded"
                                  >
                                    <option value="cash">Efectivo</option>
                                    <option value="transfer">Transferencia</option>
                                  </select>
                                </td>
                                <td className="px-6 py-4">
                                  <input
                                    type="number"
                                    defaultValue={service.cost}
                                    onChange={(e) => (editedService.cost = parseFloat(e.target.value))}
                                    className="px-2 py-1 border rounded w-24"
                                  />
                                </td>
                                <td className="px-6 py-4 flex gap-2">
                                  <button
                                    onClick={() => updateService(service.id, editedService)}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    <Save size={18} />
                                  </button>
                                  <button
                                    onClick={() => setEditingService(null)}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    <X size={18} />
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-6 py-4 text-sm">{service.date}</td>
                                <td className="px-6 py-4 text-sm font-medium">{service.client}</td>
                                <td className="px-6 py-4 text-sm">{service.service}</td>
                                <td className="px-6 py-4 text-sm">
                                  {service.paymentMethod === "transfer" ? "Transferencia" : "Efectivo"}
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-green-600">
                                  ${Number(service.cost).toFixed(2)}
                                </td>
                                <td className="px-6 py-4 flex gap-2">
                                  <button
                                    onClick={() => setEditingService(service.id)}
                                    className="text-blue-600 hover:text-blue-800 transition"
                                  >
                                    <Edit2 size={18} />
                                  </button>
                                  <button
                                    onClick={() => softDeleteService(service.id)}
                                    className="text-red-600 hover:text-red-800 transition"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ====== Owner (Principal) ======
  const OwnerDashboard = () => {
    const [newExpense, setNewExpense] = useState({
      date: new Date().toISOString().split("T")[0],
      description: "",
      category: "reposicion",
      amount: "",
    });

    const [newUser, setNewUser] = useState({
      name: "",
      pin: "",
      commissionPct: "35",
    });

    const [showAddUser, setShowAddUser] = useState(false);
    const [commissionDraft, setCommissionDraft] = useState<Record<string, string>>({});

    const ownerServices = useMemo(() => {
      return services.filter((s) => {
        const matchDeleted = ownerFilters.includeDeleted ? true : !s.deleted;
        const matchFrom = !ownerFilters.dateFrom || s.date >= ownerFilters.dateFrom;
        const matchTo = !ownerFilters.dateTo || s.date <= ownerFilters.dateTo;
        const matchPay =
          ownerFilters.paymentMethod === "all" ? true : s.paymentMethod === ownerFilters.paymentMethod;

        const q = ownerFilters.search.trim().toLowerCase();
        const matchSearch =
          !q ||
          (s.client || "").toLowerCase().includes(q) ||
          (s.service || "").toLowerCase().includes(q) ||
          (s.userName || "").toLowerCase().includes(q);

        return matchDeleted && matchFrom && matchTo && matchPay && matchSearch;
      });
    }, [services, ownerFilters]);

    const ownerExpenses = useMemo(() => {
      return expenses.filter((e) => {
        const matchDeleted = ownerFilters.includeDeleted ? true : !e.deleted;
        const matchFrom = !ownerFilters.dateFrom || e.date >= ownerFilters.dateFrom;
        const matchTo = !ownerFilters.dateTo || e.date <= ownerFilters.dateTo;
        const q = ownerFilters.search.trim().toLowerCase();
        const matchSearch = !q || (e.description || "").toLowerCase().includes(q);
        return matchDeleted && matchFrom && matchTo && matchSearch;
      });
    }, [expenses, ownerFilters]);

    const totalIncome = ownerServices.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
    const totalExpenses = ownerExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalCommissions = ownerServices.reduce((sum, s) => sum + calcCommissionAmount(s), 0);
    const netProfit = totalIncome - totalExpenses - totalCommissions;

    const byPayment = useMemo(() => {
      const cash = ownerServices
        .filter((s) => s.paymentMethod === "cash")
        .reduce((a, s) => a + (Number(s.cost) || 0), 0);
      const transfer = ownerServices
        .filter((s) => s.paymentMethod === "transfer")
        .reduce((a, s) => a + (Number(s.cost) || 0), 0);
      return { cash, transfer };
    }, [ownerServices]);

    const staffStats = users
      .filter((u) => u.active && (u.role === "staff" || u.role === "owner"))
      .map((u) => {
        const uServices = ownerServices.filter((s) => s.userId === u.id);
        const gross = uServices.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
        const commissions = uServices.reduce((sum, s) => sum + calcCommissionAmount(s), 0);
        const salonNet = gross - commissions;
        return {
          ...u,
          gross,
          commissions,
          salonNet,
          count: uServices.length,
        };
      })
      .sort((a, b) => b.gross - a.gross);

    const addExpense = async () => {
      if (!newExpense.description || !newExpense.amount) {
        showNotification("Completa todos los campos", "error");
        return;
      }
      const amount = parseFloat(newExpense.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        showNotification("Monto inválido", "error");
        return;
      }

      try {
        await addDoc(collection(db, "expenses"), {
          ...newExpense,
          amount,
          deleted: false,
          timestamp: serverTimestamp(),
        });

        setNewExpense({
          date: new Date().toISOString().split("T")[0],
          description: "",
          category: "reposicion",
          amount: "",
        });
        showNotification("Gasto registrado");
      } catch (error) {
        console.error("Error registrando gasto:", error);
        showNotification("Error al registrar gasto", "error");
      }
    };

    const addUser = async () => {
      const name = (newUser.name || "").trim();
      const pin = (newUser.pin || "").replace(/\D/g, "").slice(0, 4);
      const commissionPct = clamp(parseFloat(newUser.commissionPct) || 0, 0, 100);

      if (!name || pin.length !== 4) {
        showNotification("Nombre y PIN (4 dígitos) requeridos", "error");
        return;
      }
      if (users.some((u) => u.pin === pin)) {
        showNotification("Ese PIN ya está en uso", "error");
        return;
      }

      try {
        await addDoc(collection(db, "users"), {
          name,
          pin,
          role: "staff",
          color: "from-teal-500 to-emerald-600",
          icon: "user",
          commissionPct,
          active: true,
          createdAt: serverTimestamp(),
        });

        setNewUser({ name: "", pin: "", commissionPct: "35" });
        setShowAddUser(false);
        showNotification("Personal agregado");
      } catch (error) {
        console.error("Error agregando usuario:", error);
        showNotification("Error al agregar usuario", "error");
      }
    };

    const softDeleteExpense = async (id: string) => {
      if (!window.confirm("¿Eliminar este gasto? (Se guardará como historial)")) return;
      try {
        await updateDoc(doc(db, "expenses", id), {
          deleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: currentUser?.id,
        });
        showNotification("Gasto eliminado (historial)");
      } catch (error) {
        console.error("Error eliminando gasto:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    const deactivateUser = async (id: string) => {
      const u = users.find((x) => x.id === id);
      if (!u) return;

      if (u.role === "owner") {
        showNotification("No puedes desactivar a Principal", "error");
        return;
      }

      if (!window.confirm(`¿Desactivar a ${u.name}? Sus servicios quedarán como historial.`)) return;

      try {
        await updateDoc(doc(db, "users", id), { active: false });

        if (currentUser?.id === id) setCurrentUser(null);

        showNotification("Usuario desactivado");
      } catch (error) {
        console.error("Error desactivando usuario:", error);
        showNotification("Error al desactivar", "error");
      }
    };

    const saveCommission = async (userId: string) => {
      const raw = commissionDraft[userId];
      const pct = clamp(parseFloat(raw) || 0, 0, 100);

      try {
        await updateDoc(doc(db, "users", userId), { commissionPct: pct });
        showNotification("Comisión actualizada");
      } catch (error) {
        console.error("Error actualizando comisión:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 text-white p-6 shadow-lg">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Crown size={40} />
              <div>
                <h1 className="text-3xl font-bold">Panel Principal</h1>
                <p className="text-purple-100">Control total del salón</p>
              </div>
            </div>
            <button
              onClick={() => {
                setCurrentUser(null);
                showNotification("Sesión cerrada");
              }}
              className="flex items-center gap-2 bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-lg hover:bg-white/30 transition shadow-md border border-white/30"
            >
              <LogOut size={20} />
              Salir
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-white rounded-xl shadow-md p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <input
                type="date"
                value={ownerFilters.dateFrom}
                onChange={(e) => setOwnerFilters({ ...ownerFilters, dateFrom: e.target.value })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                placeholder="Desde"
              />
              <input
                type="date"
                value={ownerFilters.dateTo}
                onChange={(e) => setOwnerFilters({ ...ownerFilters, dateTo: e.target.value })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                placeholder="Hasta"
              />
              <select
                value={ownerFilters.paymentMethod}
                onChange={(e) => setOwnerFilters({ ...ownerFilters, paymentMethod: e.target.value as OwnerFilters["paymentMethod"] })}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
              >
                <option value="all">Todos los pagos</option>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </select>
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Buscar (cliente, servicio, personal, gasto)..."
                  value={ownerFilters.search}
                  onChange={(e) => setOwnerFilters({ ...ownerFilters, search: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={ownerFilters.includeDeleted}
                  onChange={(e) => setOwnerFilters({ ...ownerFilters, includeDeleted: e.target.checked })}
                />
                Ver eliminados
              </label>
            </div>
            <div className="mt-3">
              <button
                onClick={() =>
                  setOwnerFilters({
                    dateFrom: "",
                    dateTo: "",
                    paymentMethod: "all",
                    includeDeleted: false,
                    search: "",
                  })
                }
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
            <div className="bg-gradient-to-br from-green-400 to-green-600 text-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Ingresos</p>
                  <p className="text-3xl font-bold mt-2">${totalIncome.toFixed(2)}</p>
                  <p className="text-green-100 text-sm mt-1">{ownerServices.length} servicios</p>
                </div>
                <TrendingUp size={48} className="opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-400 to-amber-600 text-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Comisiones</p>
                  <p className="text-3xl font-bold mt-2">${totalCommissions.toFixed(2)}</p>
                  <p className="text-orange-100 text-sm mt-1">según % de cada servicio</p>
                </div>
                <Percent size={48} className="opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-400 to-red-600 text-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm font-medium">Gastos</p>
                  <p className="text-3xl font-bold mt-2">${totalExpenses.toFixed(2)}</p>
                  <p className="text-red-100 text-sm mt-1">{ownerExpenses.length} gastos</p>
                </div>
                <DollarSign size={48} className="opacity-50" />
              </div>
            </div>

            <div
              className={`bg-gradient-to-br ${
                netProfit >= 0 ? "from-blue-400 to-blue-600" : "from-gray-400 to-gray-600"
              } text-white rounded-xl shadow-lg p-6`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Utilidad neta</p>
                  <p className="text-3xl font-bold mt-2">${netProfit.toFixed(2)}</p>
                  <p className="text-blue-100 text-sm mt-1">ingresos - comisiones - gastos</p>
                </div>
                <BarChart3 size={48} className="opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <Wallet size={32} className="opacity-80" />
                <p className="text-purple-100 text-xs font-bold uppercase">Cierre de Caja</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-1">
                    <DollarSign size={14} /> Efectivo
                  </span>
                  <span className="font-bold">${byPayment.cash.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-1">
                    <CreditCard size={14} /> Transfer.
                  </span>
                  <span className="font-bold">${byPayment.transfer.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users size={24} className="text-purple-500" />
                Personal y Comisiones (%)
              </h2>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {staffStats.map((staff) => {
                  const isOwner = staff.role === "owner";
                  const draft = commissionDraft[staff.id];
                  const shownDraft = draft !== undefined ? draft : String(staff.commissionPct ?? 0);

                  return (
                    <div
                      key={staff.id}
                      className="p-4 bg-gradient-to-r from-gray-50 to-purple-50 rounded-lg border border-purple-100 hover:shadow-md transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`bg-gradient-to-r ${staff.color} text-white w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-lg`}
                          >
                            {isOwner ? <Crown size={18} /> : <User size={18} />}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">{staff.name}</p>
                            <p className="text-sm text-gray-500">{staff.count} servicios (rango)</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isOwner && (
                            <>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={shownDraft}
                                  onChange={(e) =>
                                    setCommissionDraft({
                                      ...commissionDraft,
                                      [staff.id]: e.target.value,
                                    })
                                  }
                                  className="w-20 px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-center font-bold"
                                />
                                <span className="text-gray-600 font-semibold">%</span>
                              </div>

                              <button
                                onClick={() => saveCommission(staff.id)}
                                className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition"
                                title="Guardar comisión"
                              >
                                <Save size={16} />
                              </button>
                            </>
                          )}

                          {!isOwner && (
                            <button
                              onClick={() => deactivateUser(staff.id)}
                              className="text-red-600 hover:text-red-800 transition"
                              title="Desactivar usuario"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                        <div className="bg-white rounded-lg p-3 border">
                          <p className="text-gray-500">Bruto</p>
                          <p className="font-bold text-green-700">${staff.gross.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border">
                          <p className="text-gray-500">Comisión</p>
                          <p className="font-bold text-orange-700">${staff.commissions.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border">
                          <p className="text-gray-500">Neto salón</p>
                          <p className="font-bold text-blue-700">${staff.salonNet.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg hover:from-purple-600 hover:to-pink-600 transition font-semibold shadow-md"
              >
                + Agregar nuevo personal
              </button>

              {showAddUser && (
                <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg space-y-3 border border-purple-200">
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="PIN (4 dígitos)"
                      value={newUser.pin}
                      onChange={(e) =>
                        setNewUser({
                          ...newUser,
                          pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                        })
                      }
                      maxLength={4}
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Comisión %"
                        value={newUser.commissionPct}
                        onChange={(e) => setNewUser({ ...newUser, commissionPct: e.target.value })}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                      />
                      <span className="font-bold text-gray-600">%</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={addUser}
                      className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition font-semibold"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setShowAddUser(false)}
                      className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign size={24} className="text-red-500" />
                Registrar gasto
              </h2>

              <div className="space-y-3">
                <input
                  type="date"
                  value={newExpense.date}
                  onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                />
                <select
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                >
                  <option value="reposicion">Reposición</option>
                  <option value="servicios">Servicios (luz, agua, etc.)</option>
                  <option value="mantenimiento">Mantenimiento</option>
                  <option value="salarios">Salarios</option>
                  <option value="marketing">Marketing</option>
                  <option value="otros">Otros</option>
                </select>
                <input
                  type="text"
                  placeholder="Descripción del gasto"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Monto $"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                />
                <button
                  onClick={addExpense}
                  className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white py-3 rounded-lg hover:from-red-600 hover:to-pink-600 transition font-semibold shadow-md"
                >
                  Registrar gasto
                </button>
              </div>

              <div className="mt-6 bg-gray-50 rounded-lg border overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between">
                  <p className="font-semibold text-gray-700">Gastos (rango)</p>
                  <button
                    onClick={() => exportToCSV(ownerExpenses, "gastos_rango")}
                    className="flex items-center gap-2 bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 transition text-sm"
                  >
                    <Download size={16} />
                    CSV
                  </button>
                </div>
                <div className="max-h-60 overflow-auto">
                  {ownerExpenses.length === 0 ? (
                    <p className="p-4 text-gray-500 text-sm">No hay gastos en este rango</p>
                  ) : (
                    ownerExpenses
                      .slice()
                      .reverse()
                      .map((e) => (
                        <div key={e.id} className="p-4 border-b flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-semibold text-gray-800 truncate ${
                                e.deleted ? "line-through opacity-60" : ""
                              }`}
                            >
                              {e.description} <span className="text-gray-400">({e.category})</span>
                            </p>
                            <p className="text-xs text-gray-500">{e.date}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className={`font-bold ${e.deleted ? "text-gray-500" : "text-red-600"}`}>
                              ${Number(e.amount).toFixed(2)}
                            </p>
                            {!e.deleted && (
                              <button
                                onClick={() => softDeleteExpense(e.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Eliminar (historial)"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">Servicios (rango)</h2>
              <button
                onClick={() =>
                  exportToCSV(
                    ownerServices.map((s) => ({
                      ...s,
                      commissionPct: getCommissionPctForService(s),
                      commissionAmount: calcCommissionAmount(s),
                      salonNet: (Number(s.cost) || 0) - calcCommissionAmount(s),
                      paymentMethodLabel: s.paymentMethod === "transfer" ? "Transferencia" : "Efectivo",
                    })),
                    "servicios_rango"
                  )
                }
                className="flex items-center gap-2 bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600 transition text-sm"
              >
                <Download size={16} />
                CSV
              </button>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Personal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Servicio</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Pago</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Costo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">%</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Comisión</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Neto salón</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerServices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                        No hay servicios en este rango
                      </td>
                    </tr>
                  ) : (
                    ownerServices
                      .slice()
                      .reverse()
                      .map((s) => {
                        const pct = getCommissionPctForService(s);
                        const com = calcCommissionAmount(s);
                        const net = (Number(s.cost) || 0) - com;
                        return (
                          <tr key={s.id} className="border-b hover:bg-gray-50 transition">
                            <td className={`px-4 py-3 text-sm ${s.deleted ? "line-through opacity-60" : ""}`}>
                              {s.date}
                            </td>
                            <td className={`px-4 py-3 text-sm font-medium ${s.deleted ? "line-through opacity-60" : ""}`}>
                              {s.userName}
                            </td>
                            <td className={`px-4 py-3 text-sm ${s.deleted ? "line-through opacity-60" : ""}`}>
                              {s.client}
                            </td>
                            <td className={`px-4 py-3 text-sm ${s.deleted ? "line-through opacity-60" : ""}`}>
                              {s.service}
                            </td>
                            <td className={`px-4 py-3 text-sm ${s.deleted ? "line-through opacity-60" : ""}`}>
                              {s.paymentMethod === "transfer" ? "Transferencia" : "Efectivo"}
                            </td>
                            <td className={`px-4 py-3 text-sm font-bold ${s.deleted ? "text-gray-500" : "text-green-700"}`}>
                              ${Number(s.cost).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-700">{pct.toFixed(0)}%</td>
                            <td className="px-4 py-3 text-sm font-bold text-orange-700">${com.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm font-bold text-blue-700">${net.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm">
                              {s.deleted ? (
                                <span className="text-gray-500 font-semibold">Eliminado</span>
                              ) : (
                                <span className="text-green-700 font-semibold">Activo</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Notification />
      {!currentUser && <LoginScreen />}
      {currentUser && currentUser.role === "owner" && <OwnerDashboard />}
      {currentUser && currentUser.role === "staff" && <StaffScreen />}
    </>
  );
};

export default SalonApp;