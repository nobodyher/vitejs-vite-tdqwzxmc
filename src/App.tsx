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
  Lock,
  Crown,
  User,
  DollarSign,
  TrendingUp,
  Percent,
  Wallet,
  CreditCard,
  Package,
  ShoppingCart,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Scissors,
  Check,
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
  deleteDoc,
  getDoc,
  getDocs,
} from "firebase/firestore";

import type { DocumentData } from "firebase/firestore";
import { db } from "./firebase";

// ====== TIPOS ======
type Role = "owner" | "staff";

type User = {
  id: string;
  name: string;
  pin: string;
  role: Role;
  color: string;
  ow: string;
  icon: "crown" | "user";
  commissionPct: number;
  active: boolean;
};

type PaymentMethod = "cash" | "transfer";

type ServiceItem = {
  serviceId: string;
  serviceName: string;
  servicePrice: number;
};

type ExtraItem = {
  extraId: string;
  extraName: string;
  pricePerNail: number;
  nailsCount: number;
  totalPrice: number;
};

type Service = {
  id: string;
  date: string;
  client: string;
  services?: ServiceItem[]; // ✅ NUEVO: Lista de servicios
  extras?: ExtraItem[]; // ✅ NUEVO: Lista de extras
  service?: string; // Para compatibilidad con datos antiguos
  cost: number;
  userId: string;
  userName: string;
  paymentMethod: PaymentMethod;
  commissionPct: number;
  category?: "manicura" | "pedicura"; // ✅ NUEVO
  reposicion?: number; // ✅ NUEVO: Costo total de reposición de materiales
  deleted?: boolean;
};

type Expense = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  userId?: string;
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

// ====== TIPOS CATÁLOGO ======
type CatalogService = {
  id: string;
  name: string;
  category: "manicura" | "pedicura";
  basePrice: number;
  active: boolean;
};

type Consumable = {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  stockQty: number;
  minStockAlert: number;
  active: boolean;
};

type RecipeItem = {
  consumableId: string;
  qty: number;
};

type ServiceRecipe = {
  id: string;
  serviceId: string;
  items: RecipeItem[];
};

type CatalogExtra = {
  id: string;
  name: string;
  priceSuggested: number;
  appliesToCategories: string[];
  active: boolean;
};

// ✅ NUEVO: Catálogo de extras con precios por uña
const EXTRAS_CATALOG: CatalogExtra[] = [
  {
    id: "aurora_glaseado",
    name: "Efecto Aurora/ glaseado",
    priceSuggested: 0.3,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "espejo_diseño",
    name: "Efecto espejo diseño",
    priceSuggested: 0.3,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "espejo_complete",
    name: "Efecto espejo complete",
    priceSuggested: 0.3,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "relieve_1",
    name: "Relieve 1",
    priceSuggested: 0.3,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "relieve_2",
    name: "Relieve 2",
    priceSuggested: 0.5,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "flor_3d",
    name: "Flor 3D",
    priceSuggested: 0.5,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "mano_alzada",
    name: "Mano alzada",
    priceSuggested: 0.5,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "aurora",
    name: "Efecto Aurora",
    priceSuggested: 0.5,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "blooming",
    name: "Blooming",
    priceSuggested: 0.5,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "esponja",
    name: "Esponja",
    priceSuggested: 0.5,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
  {
    id: "reconstruccion",
    name: "Reconstrucción",
    priceSuggested: 2.5,
    appliesToCategories: ["manicura", "pedicura"],
    active: true,
  },
];

// ✅ NUEVO: Costos fijos de recetas por categoría
const RECIPE_COSTS = {
  manicura: 0.33,
  pedicura: 0.5,
  "Manicura completa": 0.33,
  "Pedicura completa": 0.5,
};

// ====== HELPER ======
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

// Inject Tailwind CSS
if (typeof document !== "undefined") {
  const script = document.createElement("script");
  script.src = "https://cdn.tailwindcss.com";
  document.head.appendChild(script);
}

const SalonApp = () => {
  // ====== Estado ======
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showPin, setShowPin] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<Toast | null>(null);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    dateFrom: "",
    dateTo: "",
  });
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [serviceRecipes, setServiceRecipes] = useState<ServiceRecipe[]>([]);
  const [catalogExtras, setCatalogExtras] = useState<CatalogExtra[]>([]);
  const [catalogTab, setCatalogTab] = useState<
    "personal" | "services" | "consumables" | "extras"
  >("services");

  const [ownerFilters, setOwnerFilters] = useState<OwnerFilters>({
    dateFrom: "",
    dateTo: "",
    paymentMethod: "all",
    includeDeleted: false,
    search: "",
  });

  const [ownerTab, setOwnerTab] = useState<
    "dashboard" | "config" | "analytics"
  >("dashboard");

  const [editingCatalogService, setEditingCatalogService] = useState<
    string | null
  >(null);
  const [editingConsumable, setEditingConsumable] = useState<string | null>(
    null,
  );

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
      ow: u.ow ?? "",
      icon: u.icon ?? "user",
      commissionPct,
      active: u.active !== false,
    };
  };

  const getUserById = (id: string): User | undefined =>
    users.find((u) => u.id === id);

  const getCommissionPctForService = (s: Service): number => {
    if (typeof s.commissionPct === "number")
      return clamp(s.commissionPct, 0, 100);
    const u = getUserById(s.userId);
    return clamp(u?.commissionPct ?? 0, 0, 100);
  };

  const calcCommissionAmount = (s: Service): number => {
    const pct = getCommissionPctForService(s);
    const cost = Number(s.cost) || 0;
    return (cost * pct) / 100;
  };

  // ✅ NUEVO: Función para obtener el costo de receta según categoría
  const getRecipeCost = (category?: string): number => {
    if (!category) return 0;
    return (RECIPE_COSTS as Record<string, number>)[category] || 0;
  };

  // ✅ NUEVO: Función para obtener el costo de materiales de una receta por serviceId
  const getRecipeCostByServiceId = (serviceId?: string): number => {
    if (!serviceId) return 0;

    // Buscar la receta del servicio
    const recipe = serviceRecipes.find((r) => r.id === serviceId);
    if (!recipe) return 0;

    // Calcular el costo total multiplicando qty × unitCost de cada consumible
    let totalCost = 0;
    recipe.items.forEach((item: any) => {
      const consumable = consumables.find((c) => c.id === item.consumableId);
      if (consumable) {
        totalCost += item.qty * (consumable.unitCost || 0);
      }
    });

    return totalCost;
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

        tx.set(
          metaRef,
          { seeded: true, seededAt: serverTimestamp() },
          { merge: true },
        );
      });

      setInitialized(true);
    } catch (error) {
      console.error("Error inicializando usuarios:", error);
      showNotification("Error al inicializar", "error");
      setInitialized(true);
    }
  };

  // ====== Inicializar catálogo (solo una vez) ======
  const initializeCatalog = async () => {
    try {
      await runTransaction(db, async (tx) => {
        const metaRef = doc(db, "meta", "catalog");
        const metaSnap = await tx.get(metaRef);

        if (metaSnap.exists() && metaSnap.data()?.seeded) return;

        // Servicios base
        const defaultServices = [
          {
            name: "Manicura en gel 1 solo color",
            category: "manicura",
            basePrice: 12,
          },
          { name: "Manicura con diseño", category: "manicura", basePrice: 15 },
          {
            name: "Uñas acrílicas (base)",
            category: "manicura",
            basePrice: 25,
          },
          { name: "Uñas poligel (base)", category: "manicura", basePrice: 25 },
          { name: "Pedicure 1 tono", category: "pedicura", basePrice: 15 },
          { name: "Pedicure francesa", category: "pedicura", basePrice: 18 },
          { name: "Pedicura limpieza", category: "pedicura", basePrice: 10 },
          { name: "Manicura limpieza", category: "manicura", basePrice: 7 },
          {
            name: "Rubber uñas cortas 1 tono",
            category: "manicura",
            basePrice: 20,
          },
          {
            name: "Rubber uñas largas 1 tono",
            category: "manicura",
            basePrice: 25,
          },
          { name: "Gel builder 1 tono", category: "manicura", basePrice: 25 },
          {
            name: "Gel builder alargamiento",
            category: "manicura",
            basePrice: 30,
          },
          {
            name: "Pedicure spa velo terapia 1 tono",
            category: "pedicura",
            basePrice: 30,
          },
          { name: "Jelly spa 1 tono", category: "pedicura", basePrice: 40 },
        ];

        defaultServices.forEach((s) => {
          const newRef = doc(collection(db, "catalog_services"));
          tx.set(newRef, { ...s, active: true, createdAt: serverTimestamp() });
        });

        // Consumibles actualizados
        const defaultConsumables = [
          {
            name: "Algodón",
            unit: "gramo",
            unitCost: 0.02,
            stockQty: 500,
            minStockAlert: 150,
          },
          {
            name: "Bastoncillos",
            unit: "unidad",
            unitCost: 0.01,
            stockQty: 100,
            minStockAlert: 10,
          },
          {
            name: "Campo quirúrgico",
            unit: "unidad",
            unitCost: 0.06,
            stockQty: 100,
            minStockAlert: 10,
          },
          {
            name: "Gorro",
            unit: "unidad",
            unitCost: 0.03,
            stockQty: 100,
            minStockAlert: 10,
          },
          {
            name: "Guantes (par)",
            unit: "par",
            unitCost: 0.13,
            stockQty: 50,
            minStockAlert: 10,
          },
          {
            name: "Mascarillas",
            unit: "unidad",
            unitCost: 0.02,
            stockQty: 100,
            minStockAlert: 10,
          },
          {
            name: "Moldes esculpir",
            unit: "unidad",
            unitCost: 0.02,
            stockQty: 300,
            minStockAlert: 50,
          },
          {
            name: "Palillo naranja",
            unit: "unidad",
            unitCost: 0.01,
            stockQty: 100,
            minStockAlert: 10,
          },
          {
            name: "Papel film",
            unit: "metro",
            unitCost: 0.0247,
            stockQty: 150,
            minStockAlert: 30,
          },
          {
            name: "Toalla desechable",
            unit: "metro",
            unitCost: 0.025,
            stockQty: 50,
            minStockAlert: 10,
          },
          {
            name: "Wipes",
            unit: "unidad",
            unitCost: 0.01,
            stockQty: 400,
            minStockAlert: 50,
          },
        ];

        defaultConsumables.forEach((c) => {
          const newRef = doc(collection(db, "consumables"));
          tx.set(newRef, { ...c, active: true, createdAt: serverTimestamp() });
        });

        tx.set(
          metaRef,
          { seeded: true, seededAt: serverTimestamp() },
          { merge: true },
        );
      });

      showNotification("Catálogo inicializado");
    } catch (error) {
      console.error("Error inicializando catálogo:", error);
      showNotification("Error al inicializar catálogo", "error");
    }
  };

  // ====== Cargar datos en tiempo real ======
  useEffect(() => {
    initializeDefaultUsers();
  }, []);

  useEffect(() => {
    initializeCatalog();
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const q = query(collection(db, "users"), orderBy("name", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) =>
          normalizeUser({ id: d.id, ...d.data() }),
        );
        setUsers(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error cargando usuarios:", error);
        showNotification("Error cargando usuarios", "error");
        setLoading(false);
      },
    );

    return () => unsub();
  }, [initialized]);

  useEffect(() => {
    if (!initialized) return;

    const q = query(collection(db, "services"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Service,
        );
        setServices(data);
      },
      (error) => {
        console.error("Error cargando servicios:", error);
        showNotification("Error cargando servicios", "error");
      },
    );

    return () => unsub();
  }, [initialized]);

  useEffect(() => {
    if (!initialized) return;

    const q = query(collection(db, "expenses"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Expense,
        );
        setExpenses(data);
      },
      (error) => {
        console.error("Error cargando gastos:", error);
        showNotification("Error cargando gastos", "error");
      },
    );

    return () => unsub();
  }, [initialized]);

  // Cargar catálogo de servicios
  useEffect(() => {
    if (!initialized) return;
    const q = query(collection(db, "catalog_services"), orderBy("name", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CatalogService,
      );
      setCatalogServices(data);
    });
    return () => unsub();
  }, [initialized]);

  // Cargar consumibles
  useEffect(() => {
    if (!initialized) return;
    const q = query(collection(db, "consumables"), orderBy("name", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Consumable,
      );
      setConsumables(data);
    });
    return () => unsub();
  }, [initialized]);

  // Cargar recetas
  useEffect(() => {
    if (!initialized) return;
    const unsub = onSnapshot(collection(db, "service_recipes"), (snap) => {
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as ServiceRecipe,
      );
      setServiceRecipes(data);
    });
    return () => unsub();
  }, [initialized]);

  // Cargar extras
  useEffect(() => {
    if (!initialized) return;
    const q = query(collection(db, "catalog_extras"), orderBy("name", "asc"));
    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CatalogExtra,
      );
      setCatalogExtras(data);

      // Sincronizar precios automáticamente desde EXTRAS_CATALOG
      for (const extra of data) {
        const catalogExtra = EXTRAS_CATALOG.find((e) => e.id === extra.id);
        const currentPrice = (extra as any).price || extra.priceSuggested || 0;

        if (catalogExtra && (!currentPrice || currentPrice === 0)) {
          try {
            await updateDoc(doc(db, "catalog_extras", extra.id), {
              price: catalogExtra.priceSuggested,
              priceSuggested: catalogExtra.priceSuggested,
            });
            console.log(
              `✅ Sincronizado: ${extra.name} - $${catalogExtra.priceSuggested}`,
            );
          } catch (error) {
            console.error(`❌ Error sincronizando ${extra.name}:`, error);
          }
        }
      }
    });
    return () => unsub();
  }, [initialized]);

  // ====== Notificaciones ======
  const showNotification = (
    message: string,
    type: Toast["type"] = "success",
  ) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 2800);
  };

  const Notification = () => {
    if (!notification) return null;
    const bg =
      notification.type === "success"
        ? "bg-green-500"
        : notification.type === "error"
          ? "bg-red-500"
          : "bg-blue-500";
    const Icon =
      notification.type === "success"
        ? CheckCircle
        : notification.type === "error"
          ? XCircle
          : AlertTriangle;

    return (
      <div
        className={`fixed top-4 right-4 ${bg} text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-bounce`}
      >
        <Icon size={24} />
        <span className="font-semibold">{notification.message}</span>
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
      if (e.key === "Enter" && (pins[userId] || "").length === 4)
        handleLogin(userId);
    };

    const activeUsers = users.filter((u) => u.active);

    if (loading) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 p-4 rounded-3xl shadow-2xl mb-6 animate-pulse">
              <TrendingUp className="text-white" size={56} />
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
              <TrendingUp className="text-white" size={56} />
            </div>
            <h1 className="text-5xl font-black text-gray-800 mb-3 tracking-tight">
              Blossom Nails
            </h1>
            <p className="text-gray-500 text-lg font-medium">
              Sistema de Gestión
            </p>
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
                  <h3 className="text-2xl font-bold text-gray-800 mb-1">
                    {user.name}
                  </h3>
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
                        onChange={(e) =>
                          handlePinChange(user.id, e.target.value)
                        }
                        onKeyPress={(e) => handleKeyPress(e, user.id)}
                        maxLength={4}
                        placeholder="••••"
                        className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:border-purple-500 focus:bg-white focus:outline-none text-3xl text-center tracking-[0.5em] transition-all font-bold"
                      />
                      <button
                        onClick={() =>
                          setShowPin({
                            ...showPin,
                            [user.id]: !showPin[user.id],
                          })
                        }
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-500 transition-colors"
                      >
                        {showPin[user.id] ? (
                          <EyeOff size={20} />
                        ) : (
                          <Eye size={20} />
                        )}
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
      services: [] as ServiceItem[],
      extras: [] as ExtraItem[],
      service: "", // Para compatibilidad
      cost: "",
      paymentMethod: "cash" as PaymentMethod,
      catalogServiceId: "",
      category: undefined as "manicura" | "pedicura" | undefined,
    });

    const [showCatalogSelector, setShowCatalogSelector] = useState(false);
    const [showExtrasSelector, setShowExtrasSelector] = useState(false);
    const [selectedServiceId, setSelectedServiceId] = useState("");

    const userServices = services.filter(
      (s) => s.userId === currentUser?.id && !s.deleted,
    );

    const filteredServices = userServices.filter((s) => {
      const matchSearch =
        !filters.search ||
        s.client.toLowerCase().includes(filters.search.toLowerCase()) ||
        s.service?.toLowerCase().includes(filters.search.toLowerCase()) ||
        false ||
        s.services?.some((srv) =>
          srv.serviceName.toLowerCase().includes(filters.search.toLowerCase()),
        ) ||
        false;
      const matchDateFrom = !filters.dateFrom || s.date >= filters.dateFrom;
      const matchDateTo = !filters.dateTo || s.date <= filters.dateTo;
      return matchSearch && matchDateFrom && matchDateTo;
    });

    const activeServices = catalogServices.filter((s) => s.active);

    // ✅ NUEVO: Calcular costo total automáticamente
    const calculateTotalCost = (
      servicesList: ServiceItem[],
      extrasList: ExtraItem[],
    ): number => {
      const servicesTotal = servicesList.reduce(
        (sum, s) => sum + s.servicePrice,
        0,
      );
      const extrasTotal = extrasList.reduce((sum, e) => sum + e.totalPrice, 0);
      return servicesTotal + extrasTotal;
    };

    // ✅ NUEVO: Calcular el costo total de reposición de todos los servicios
    const calculateTotalReplenishmentCost = (
      servicesList: ServiceItem[],
    ): number => {
      return servicesList.reduce((sum, s) => {
        return sum + getRecipeCostByServiceId(s.serviceId);
      }, 0);
    };

    // ✅ NUEVO: Al seleccionar del catálogo, agregar a lista de servicios
    const selectCatalogService = (cs: CatalogService) => {
      console.log("Seleccionando servicio:", cs);
      const newServiceItem: ServiceItem = {
        serviceId: cs.id,
        serviceName: cs.name,
        servicePrice: cs.basePrice,
      };
      setNewService((prev) => {
        const updated = {
          ...prev,
          services: [...prev.services, newServiceItem],
          category: (cs.category as "manicura" | "pedicura") || undefined,
        };
        console.log("Nuevo estado de servicio:", updated);
        return updated;
      });
    };

    // ✅ NUEVO: Actualizar cantidad de uñas por extra desde la lista
    const updateExtraNailsCount = (extraId: string, nailsCount: number) => {
      const extra = EXTRAS_CATALOG.find((e) => e.id === extraId);
      if (!extra) return;

      if (!Number.isFinite(nailsCount) || nailsCount < 0) {
        showNotification("Ingresa un número de uñas válido", "error");
        return;
      }

      setNewService((prev) => {
        const filtered = prev.extras.filter((e) => e.extraId !== extraId);
        if (nailsCount === 0) {
          return { ...prev, extras: filtered };
        }
        const newExtraItem: ExtraItem = {
          extraId: extra.id,
          extraName: extra.name,
          pricePerNail: extra.priceSuggested,
          nailsCount,
          totalPrice: extra.priceSuggested * nailsCount,
        };

        return { ...prev, extras: [...filtered, newExtraItem] };
      });
    };

    // ✅ NUEVO: Eliminar servicio de la lista
    const removeServiceFromList = (index: number) => {
      setNewService((prev) => ({
        ...prev,
        services: prev.services.filter((_, i) => i !== index),
      }));
    };

    // ✅ NUEVO: Eliminar extra de la lista
    const removeExtraFromList = (index: number) => {
      setNewService((prev) => ({
        ...prev,
        extras: prev.extras.filter((_, i) => i !== index),
      }));
    };

    const totalCost = calculateTotalCost(
      newService.services,
      newService.extras,
    );

    // Descuento de consumibles por servicio
    const deductConsumables = async (serviceCategory: string) => {
      try {
        // Mapeo de consumibles a descontar por categoría
        const consumablesToDeduct: { [key: string]: number } = {};

        if (serviceCategory === "manicura") {
          // Manicura: costo total $0.33
          consumablesToDeduct["Guantes (par)"] = 1;
          consumablesToDeduct["Mascarilla"] = 1;
          consumablesToDeduct["Palillo naranja"] = 1;
          consumablesToDeduct["Bastoncillos"] = 1;
          consumablesToDeduct["Wipes"] = 1;
          consumablesToDeduct["Toalla desechable"] = 1;
          consumablesToDeduct["Gorro"] = 1;
          consumablesToDeduct["Campo quirúrgico"] = 1;
          consumablesToDeduct["Moldes esculpir"] = 1;
        } else if (serviceCategory === "pedicura") {
          // Pedicura: costo total ~$0.50
          consumablesToDeduct["Campo quirúrgico"] = 1;
          consumablesToDeduct["Algodón"] = 5;
          consumablesToDeduct["Guantes (par)"] = 1;
          consumablesToDeduct["Mascarilla"] = 1;
          consumablesToDeduct["Palillo naranja"] = 1;
          consumablesToDeduct["Wipes"] = 1;
          consumablesToDeduct["Gorro"] = 1;
          consumablesToDeduct["Bastoncillos"] = 1;
        }

        // Actualizar cada consumible
        for (const [consumableName, quantity] of Object.entries(
          consumablesToDeduct,
        )) {
          const consumableRef = doc(db, "consumables", consumableName);
          const consumableSnap = await getDoc(consumableRef);

          if (consumableSnap.exists()) {
            const currentStock = consumableSnap.data().quantity || 0;
            await updateDoc(consumableRef, {
              quantity: Math.max(0, currentStock - quantity),
              lastDeducted: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        console.log("Error descargando consumibles (no critico):", error);
      }
    };

    const addService = async () => {
      console.log("Presionado botón guardar");
      if (!newService.client || newService.services.length === 0) {
        showNotification("Completa cliente y al menos un servicio", "error");
        return;
      }

      const cost = totalCost;

      if (cost <= 0) {
        showNotification("Costo inválido", "error");
        return;
      }

      const commissionPct = clamp(
        Number(currentUser?.commissionPct || 0),
        0,
        100,
      );

      // ✅ NUEVO: Calcular el costo total de reposición sumando todos los servicios
      const totalReposicion = calculateTotalReplenishmentCost(
        newService.services,
      );

      try {
        const serviceData: any = {
          userId: currentUser?.id,
          userName: currentUser?.name,
          date: newService.date,
          client: newService.client.trim(),
          service:
            newService.services.map((s) => s.serviceName).join(", ") ||
            "Servicios personalizados",
          cost: parseFloat(cost.toFixed(2)),
          commissionPct,
          paymentMethod: newService.paymentMethod,
          reposicion: parseFloat(totalReposicion.toFixed(2)), // ✅ NUEVO: Guardar costo total de reposición
          deleted: false,
          timestamp: serverTimestamp(),
        };

        // Solo agregar servicios si hay
        if (newService.services.length > 0) {
          serviceData.services = newService.services;
        }

        // Solo agregar extras si hay
        if (newService.extras.length > 0) {
          serviceData.extras = newService.extras;
        }

        // Solo agregar categoría si hay
        if (newService.category) {
          serviceData.category = newService.category;
        }

        console.log("Guardando con datos:", serviceData);
        const docRef = await addDoc(collection(db, "services"), serviceData);
        console.log("Guardado exitosamente:", docRef.id);

        // Descontar consumibles si hay categoría
        if (newService.category) {
          await deductConsumables(newService.category);
        }

        setNewService({
          date: new Date().toISOString().split("T")[0],
          client: "",
          services: [],
          extras: [],
          service: "",
          cost: "",
          paymentMethod: "cash",
          catalogServiceId: "",
          category: undefined,
        });
        showNotification("Servicio agregado exitosamente");
      } catch (error: any) {
        console.error("Error completo:", error);
        const errorMessage =
          error?.message || error?.code || "Error desconocido";
        showNotification(`Error: ${errorMessage}`, "error");
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
      if (
        !window.confirm("¿Eliminar este servicio? (Se guardará como historial)")
      )
        return;
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

    const totalCommissionToday = userServices
      .filter((s) => s.date === new Date().toISOString().split("T")[0])
      .reduce((sum, s) => sum + calcCommissionAmount(s), 0);

    return (
      <div className="min-h-screen bg-gray-50">
        <div
          className={`bg-gradient-to-r ${currentUser?.color} text-white p-6 shadow-lg`}
        >
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

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
              <input
                type="date"
                value={newService.date}
                onChange={(e) =>
                  setNewService({ ...newService, date: e.target.value })
                }
                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Nombre del cliente"
                value={newService.client}
                onChange={(e) =>
                  setNewService({ ...newService, client: e.target.value })
                }
                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none"
              />
              <select
                value={selectedServiceId}
                onChange={(e) => {
                  if (e.target.value) {
                    const selected = activeServices.find(
                      (cs) => cs.id === e.target.value,
                    );
                    if (selected) {
                      selectCatalogService(selected);
                      setSelectedServiceId("");
                    }
                  }
                }}
                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none"
              >
                <option value="">Servicio</option>
                {activeServices.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name} - ${cs.basePrice}
                  </option>
                ))}
              </select>
              <select
                value={newService.paymentMethod}
                onChange={(e) =>
                  setNewService({
                    ...newService,
                    paymentMethod: e.target.value as PaymentMethod,
                  })
                }
                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </select>
              <select
                value={newService.category || ""}
                onChange={(e) =>
                  setNewService({
                    ...newService,
                    category:
                      (e.target.value as "manicura" | "pedicura") || undefined,
                  })
                }
                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none"
              >
                <option value="">Categoría (opcional)</option>
                <option value="manicura">Manicura completa</option>
                <option value="pedicura">Pedicura completa</option>
              </select>
            </div>

            {/* ✅ NUEVO: Lista de servicios agregados */}
            {newService.services.length > 0 && (
              <div className="mb-4 p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <p className="font-bold text-green-800 mb-3">
                  Servicios seleccionados:
                </p>
                <div className="space-y-2">
                  {newService.services.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center bg-white p-3 rounded-lg border border-green-200"
                    >
                      <div>
                        <p className="font-semibold text-gray-800">
                          {s.serviceName}
                        </p>
                        <p className="text-sm text-green-700">
                          ${s.servicePrice.toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeServiceFromList(idx)}
                        className="text-red-600 hover:text-red-800 transition"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ✅ NUEVO: Selector de extras en dropdown */}
            <div className="bg-blue-50 rounded-lg border-2 border-blue-200 p-4 mb-4">
              <button
                onClick={() => setShowExtrasSelector(!showExtrasSelector)}
                className="w-full flex justify-between items-center font-bold text-blue-800 hover:text-blue-900 transition"
              >
                <span>Extras (elige varios y coloca las uñas)</span>
                <span
                  className={`transform transition-transform ${
                    showExtrasSelector ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
              </button>
              <p className="text-xs text-blue-700 mt-1 mb-3">
                Ejemplo: Extra efecto ojo de gato — Uñas: 2. Deja en 0 si no
                aplica.
              </p>
              {showExtrasSelector && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {EXTRAS_CATALOG.filter((e) => e.active).map((extra) => {
                    const current = newService.extras.find(
                      (e) => e.extraId === extra.id,
                    );
                    return (
                      <div
                        key={extra.id}
                        className="flex items-center justify-between bg-white p-3 rounded-lg border border-blue-100"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">
                            {extra.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            ${extra.priceSuggested.toFixed(2)} por uña
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Uñas</label>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={current?.nailsCount ?? 0}
                            onChange={(e) =>
                              updateExtraNailsCount(
                                extra.id,
                                parseInt(e.target.value || "0", 10),
                              )
                            }
                            className="w-20 px-3 py-2 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ✅ NUEVO: Lista de extras agregados */}
            {newService.extras.length > 0 && (
              <div className="mb-4 p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                <p className="font-bold text-orange-800 mb-3">
                  Extras seleccionados:
                </p>
                <div className="space-y-2">
                  {newService.extras.map((e, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center bg-white p-3 rounded-lg border border-orange-200"
                    >
                      <div>
                        <p className="font-semibold text-gray-800">
                          {e.extraName}
                        </p>
                        <p className="text-sm text-orange-700">
                          ${e.pricePerNail.toFixed(2)}/uña × {e.nailsCount} uñas
                          = ${e.totalPrice.toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeExtraFromList(idx)}
                        className="text-red-600 hover:text-red-800 transition"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ✅ NUEVO: Resumen de costo total */}
            <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg border-2 border-pink-200 p-4 mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600 font-semibold">
                    COSTO TOTAL:
                  </p>
                  <p className="text-3xl font-bold text-pink-600">
                    ${totalCost.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={addService}
                  disabled={
                    newService.client === "" || newService.services.length === 0
                  }
                  className={`text-white px-8 py-3 rounded-lg hover:shadow-lg transition font-bold flex items-center gap-2 ${
                    newService.client === "" || newService.services.length === 0
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700"
                  }`}
                >
                  <Check size={20} />
                  Guardar Servicio
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-400 to-green-600 text-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-sm font-semibold mb-2 opacity-90">
              Servicios Hoy
            </h3>
            <p className="text-3xl font-bold">
              {
                userServices.filter(
                  (s) => s.date === new Date().toISOString().split("T")[0],
                ).length
              }
            </p>
            <p className="text-green-100 text-sm mt-1">servicios completados</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters({ ...filters, dateFrom: e.target.value })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-pink-500 focus:outline-none text-gray-900 bg-white"
                placeholder="Desde"
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters({ ...filters, dateTo: e.target.value })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-pink-500 focus:outline-none text-gray-900 bg-white"
                placeholder="Hasta"
              />
              <button
                onClick={() =>
                  setFilters({ search: "", dateFrom: "", dateTo: "" })
                }
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Limpiar Filtros
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
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Servicio
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Pago
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Costo
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-gray-500"
                      >
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
                          <tr
                            key={service.id}
                            className="border-b hover:bg-gray-50 transition"
                          >
                            {isEditing ? (
                              <>
                                <td className="px-6 py-4">
                                  <input
                                    type="date"
                                    defaultValue={service.date}
                                    onChange={(e) =>
                                      (editedService.date = e.target.value)
                                    }
                                    className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none"
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <input
                                    type="text"
                                    defaultValue={service.client}
                                    onChange={(e) =>
                                      (editedService.client = e.target.value)
                                    }
                                    className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none w-full"
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <input
                                    type="text"
                                    defaultValue={
                                      service.service ||
                                      "Servicios personalizados"
                                    }
                                    onChange={(e) =>
                                      (editedService.service = e.target.value)
                                    }
                                    className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none w-full"
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <select
                                    defaultValue={
                                      service.paymentMethod || "cash"
                                    }
                                    onChange={(e) =>
                                      (editedService.paymentMethod = e.target
                                        .value as PaymentMethod)
                                    }
                                    className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none"
                                  >
                                    <option value="cash">Efectivo</option>
                                    <option value="transfer">
                                      Transferencia
                                    </option>
                                  </select>
                                </td>
                                <td className="px-6 py-4">
                                  <input
                                    type="number"
                                    defaultValue={service.cost}
                                    onChange={(e) =>
                                      (editedService.cost = parseFloat(
                                        e.target.value,
                                      ))
                                    }
                                    className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-pink-500 focus:outline-none"
                                  />
                                </td>
                                <td className="px-6 py-4 flex gap-2">
                                  <button
                                    onClick={() =>
                                      updateService(service.id, editedService)
                                    }
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
                                <td className="px-6 py-4 text-sm">
                                  {service.date}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium">
                                  {service.client}
                                </td>
                                <td className="px-6 py-4 text-sm">
                                  <div>
                                    <p className="font-medium text-gray-800">
                                      {service.service ||
                                        "Servicios personalizados"}
                                    </p>
                                    {service.services &&
                                      service.services.length > 0 && (
                                        <div className="text-xs text-gray-600 mt-1">
                                          {service.services.map((s, i) => (
                                            <div key={i}>{s.serviceName}</div>
                                          ))}
                                        </div>
                                      )}
                                    {service.extras &&
                                      service.extras.length > 0 && (
                                        <div className="text-xs text-gray-500 mt-1 border-t pt-1">
                                          {service.extras.map((e, i) => (
                                            <div key={i}>
                                              + {e.extraName} ({e.nailsCount}{" "}
                                              uñas)
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm">
                                  {service.paymentMethod === "transfer"
                                    ? "Transferencia"
                                    : "Efectivo"}
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-green-600">
                                  ${Number(service.cost).toFixed(2)}
                                </td>
                                <td className="px-6 py-4 flex gap-2">
                                  <button
                                    onClick={() =>
                                      setEditingService(service.id)
                                    }
                                    className="text-blue-600 hover:text-blue-800 transition"
                                  >
                                    <Edit2 size={18} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      softDeleteService(service.id)
                                    }
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

  // ====== // ====== Owner Dashboard ======
  const OwnerDashboard = () => {
    // ✅ NUEVO: Estado para agregar gastos
    const [newExpense, setNewExpense] = useState({
      date: new Date().toISOString().split("T")[0],
      description: "",
      category: "Agua",
      amount: "",
      userId: "",
    });

    // ✅ NUEVO: Estado para editar servicios
    const [editingServiceId, setEditingServiceId] = useState<string | null>(
      null,
    );
    const [editingServiceCost, setEditingServiceCost] = useState("");

    // ✅ NUEVO: Funciones para editar y eliminar servicios
    const updateServiceCost = async (serviceId: string, newCost: number) => {
      if (!Number.isFinite(newCost) || newCost <= 0) {
        showNotification("Costo inválido", "error");
        return;
      }

      try {
        await updateDoc(doc(db, "services", serviceId), {
          cost: newCost,
        });
        setEditingServiceId(null);
        showNotification("Costo actualizado");
      } catch (error) {
        console.error("Error actualizando costo:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    const softDeleteServiceAdmin = async (serviceId: string) => {
      if (
        !window.confirm(
          "¿Eliminar temporalmente este servicio? (Se guardará como historial)",
        )
      )
        return;

      try {
        await updateDoc(doc(db, "services", serviceId), {
          deleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: currentUser?.id,
        });
        showNotification("Servicio eliminado temporalmente");
      } catch (error) {
        console.error("Error eliminando servicio:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    const permanentlyDeleteService = async (serviceId: string) => {
      if (
        !window.confirm(
          "¿Eliminar permanentemente este servicio? Esta acción no se puede deshacer.",
        )
      )
        return;

      try {
        await deleteDoc(doc(db, "services", serviceId));
        showNotification("Servicio eliminado permanentemente");
      } catch (error) {
        console.error("Error eliminando servicio:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    const restoreDeletedService = async (serviceId: string) => {
      try {
        await updateDoc(doc(db, "services", serviceId), {
          deleted: false,
          deletedAt: null,
          deletedBy: null,
        });
        showNotification("Servicio restaurado");
      } catch (error) {
        console.error("Error restaurando servicio:", error);
        showNotification("Error al restaurar", "error");
      }
    };

    const filteredServices = services.filter((s) => {
      if (!ownerFilters.includeDeleted && s.deleted) return false;
      const matchSearch =
        !ownerFilters.search ||
        s.client.toLowerCase().includes(ownerFilters.search.toLowerCase()) ||
        (s.service?.toLowerCase() || "").includes(
          ownerFilters.search.toLowerCase(),
        ) ||
        s.userName.toLowerCase().includes(ownerFilters.search.toLowerCase());
      const matchDateFrom =
        !ownerFilters.dateFrom || s.date >= ownerFilters.dateFrom;
      const matchDateTo = !ownerFilters.dateTo || s.date <= ownerFilters.dateTo;
      const matchPayment =
        ownerFilters.paymentMethod === "all" ||
        s.paymentMethod === ownerFilters.paymentMethod;
      return matchSearch && matchDateFrom && matchDateTo && matchPayment;
    });

    const filteredExpenses = expenses.filter((e) => {
      if (!ownerFilters.includeDeleted && e.deleted) return false;
      const matchDateFrom =
        !ownerFilters.dateFrom || e.date >= ownerFilters.dateFrom;
      const matchDateTo = !ownerFilters.dateTo || e.date <= ownerFilters.dateTo;
      return matchDateFrom && matchDateTo;
    });

    const totalRevenue = filteredServices.reduce((sum, s) => sum + s.cost, 0);
    const totalExpenses = filteredExpenses
      .filter((e) => e.category !== "Comisiones")
      .reduce((sum, e) => sum + e.amount, 0);

    // Calcular comisiones desde servicios (SIN restar gastos de comisiones pagadas)
    const totalCommissions = filteredServices.reduce(
      (sum, s) => sum + calcCommissionAmount(s),
      0,
    );

    let totalReplenishmentCost = filteredServices.reduce((sum, s) => {
      // ✅ NUEVO: Usar el valor guardado de reposición, o calcular basado en categoría para compatibilidad
      return sum + (s.reposicion || getRecipeCost(s.category));
    }, 0);
    // Restar gastos de reposición
    const reposicionExpenses = filteredExpenses.reduce((sum, e) => {
      return e.category === "Reposicion" ? sum + e.amount : sum;
    }, 0);
    totalReplenishmentCost -= reposicionExpenses;

    // Ganancia Neta = Ingresos - Gastos (sin comisiones) - Comisiones Ganadas - Reposición
    // Los gastos de comisiones NO afectan la ganancia neta (solo son movimientos de dinero)
    const netProfit =
      totalRevenue - totalExpenses - totalCommissions - totalReplenishmentCost;

    const consumableUsage = useMemo(() => {
      const usage: Record<string, { count: number; category: string }> = {};

      filteredServices.forEach((s) => {
        if (s.category) {
          const key = s.category;
          if (!usage[key]) {
            usage[key] = { count: 0, category: s.category };
          }
          usage[key].count++;
        }
      });

      return Object.entries(usage)
        .map(([category, data]) => ({
          category,
          count: data.count,
          totalCost:
            data.count *
            getRecipeCost(data.category as "manicura" | "pedicura"),
        }))
        .sort((a, b) => b.count - a.count);
    }, [filteredServices]);

    const userStats = useMemo(() => {
      const stats: Record<
        string,
        {
          name: string;
          revenue: number;
          commission: number;
          commissionPaid: number;
          services: number;
          color: string;
        }
      > = {};

      filteredServices.forEach((s) => {
        if (!stats[s.userId]) {
          const user = getUserById(s.userId);
          stats[s.userId] = {
            name: s.userName,
            revenue: 0,
            commission: 0,
            commissionPaid: 0,
            services: 0,
            color: user?.color || "from-gray-400 to-gray-600",
          };
        }
        stats[s.userId].revenue += s.cost;
        stats[s.userId].commission += calcCommissionAmount(s);
        stats[s.userId].services++;
      });

      // Calcular comisiones pagadas desde los gastos
      filteredExpenses.forEach((e) => {
        if (e.category === "Comisiones" && e.userId) {
          if (stats[e.userId]) {
            stats[e.userId].commissionPaid += e.amount;
          }
        }
      });

      return Object.values(stats).sort((a, b) => b.revenue - a.revenue);
    }, [filteredServices, filteredExpenses, users]);

    // ✅ NUEVO: Agregar gasto
    const addExpense = async () => {
      if (
        !newExpense.description ||
        !newExpense.category ||
        !newExpense.amount
      ) {
        showNotification("Completa todos los campos", "error");
        return;
      }

      // Validar que si es Comisiones, se seleccione un usuario
      if (newExpense.category === "Comisiones" && !newExpense.userId) {
        showNotification("Selecciona un personal para las comisiones", "error");
        return;
      }

      const amount = parseFloat(newExpense.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        showNotification("Monto inválido", "error");
        return;
      }

      try {
        const expenseData: any = {
          date: newExpense.date,
          description: newExpense.description.trim(),
          category: newExpense.category.trim(),
          amount,
          deleted: false,
          timestamp: serverTimestamp(),
        };

        // Agregar userId si es comisiones
        if (newExpense.category === "Comisiones" && newExpense.userId) {
          expenseData.userId = newExpense.userId;
        }

        const result = await addDoc(collection(db, "expenses"), expenseData);

        // Log para confirmar que el gasto se guardó con la categoría correcta
        console.log("Gasto guardado:", {
          categoria: newExpense.category,
          monto: amount,
          userId: newExpense.userId || "N/A",
          docId: result.id,
        });

        setNewExpense({
          date: new Date().toISOString().split("T")[0],
          description: "",
          category: "Agua",
          amount: "",
          userId: "",
        });
        showNotification("Gasto agregado");
      } catch (error) {
        console.error("Error agregando gasto:", error);
        showNotification("Error al agregar gasto", "error");
      }
    };

    // ✅ NUEVO: Eliminar gasto
    const deleteExpense = async (id: string) => {
      if (!window.confirm("¿Eliminar este gasto?")) return;
      try {
        await deleteDoc(doc(db, "expenses", id));
        showNotification("Gasto eliminado");
      } catch (error) {
        console.error("Error eliminando gasto:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Search size={24} className="text-purple-500" />
            Filtros
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <input
              type="date"
              value={ownerFilters.dateFrom}
              onChange={(e) =>
                setOwnerFilters({ ...ownerFilters, dateFrom: e.target.value })
              }
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
            />
            <input
              type="date"
              value={ownerFilters.dateTo}
              onChange={(e) =>
                setOwnerFilters({ ...ownerFilters, dateTo: e.target.value })
              }
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
            />
            <select
              value={ownerFilters.paymentMethod}
              onChange={(e) =>
                setOwnerFilters({
                  ...ownerFilters,
                  paymentMethod: e.target.value as "all" | PaymentMethod,
                })
              }
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
            >
              <option value="all">Todos los pagos</option>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
            <input
              type="text"
              placeholder="Buscar..."
              value={ownerFilters.search}
              onChange={(e) =>
                setOwnerFilters({ ...ownerFilters, search: e.target.value })
              }
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
            />
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
              Limpiar
            </button>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={ownerFilters.includeDeleted}
                onChange={(e) =>
                  setOwnerFilters({
                    ...ownerFilters,
                    includeDeleted: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
              Incluir servicios eliminados
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-green-400 to-green-600 text-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign size={32} />
              <h3 className="text-sm font-semibold opacity-90">
                Ingresos Totales
              </h3>
            </div>
            <p className="text-3xl font-bold">${totalRevenue.toFixed(2)}</p>
            <p className="text-green-100 text-sm mt-1">
              {filteredServices.length} servicios
            </p>
          </div>

          <div className="bg-gradient-to-br from-red-400 to-red-600 text-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard size={32} />
              <h3 className="text-sm font-semibold opacity-90">Gastos</h3>
            </div>
            <p className="text-3xl font-bold">${totalExpenses.toFixed(2)}</p>
            <p className="text-red-100 text-sm mt-1">
              {filteredExpenses.length} registros
            </p>
          </div>

          <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Package size={32} />
              <h3 className="text-sm font-semibold opacity-90">Reposición</h3>
            </div>
            <p className="text-3xl font-bold">
              ${totalReplenishmentCost.toFixed(2)}
            </p>
            <p className="text-orange-100 text-sm mt-1">consumibles</p>
          </div>

          <div className="bg-gradient-to-br from-purple-400 to-purple-600 text-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Wallet size={32} />
              <h3 className="text-sm font-semibold opacity-90">
                Ganancia Neta
              </h3>
            </div>
            <p className="text-3xl font-bold">${netProfit.toFixed(2)}</p>
            <p className="text-purple-100 text-sm mt-1">después de costos</p>
          </div>
        </div>

        {/* Comisiones por Personal - Aparece ANTES de Gestión de Gastos */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Percent size={24} className="text-blue-500" />
            Comisiones por Personal
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userStats.length === 0 ? (
              <div className="col-span-full text-center text-gray-500 py-8">
                No hay datos disponibles
              </div>
            ) : (
              userStats.map((stat) => (
                <div
                  key={stat.name}
                  className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-gray-800 text-lg">
                      {stat.name}
                    </h4>
                    <span className="text-xs font-semibold bg-blue-200 text-blue-800 px-2 py-1 rounded-full">
                      {stat.services} servicios
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">
                        Ingresos Generados
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        ${stat.revenue.toFixed(2)}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">
                        Comisión Ganada
                      </p>
                      <p
                        className={`text-2xl font-bold ${
                          stat.commission - stat.commissionPaid < 0
                            ? "text-red-600"
                            : "text-blue-600"
                        }`}
                      >
                        {stat.commission - stat.commissionPaid < 0 ? "-" : ""}$
                        {Math.abs(
                          stat.commission - stat.commissionPaid,
                        ).toFixed(2)}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">
                        Comisión Pagada
                      </p>
                      <p className="text-2xl font-bold text-orange-600">
                        ${stat.commissionPaid.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ✅ NUEVO: Módulo de Gastos */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <CreditCard size={24} className="text-red-500" />
            Gestión de Gastos
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 p-4 bg-red-50 rounded-lg">
            <input
              type="date"
              value={newExpense.date}
              onChange={(e) =>
                setNewExpense({ ...newExpense, date: e.target.value })
              }
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-gray-900 bg-white"
            />
            <input
              type="text"
              placeholder="Concepto"
              value={newExpense.description}
              onChange={(e) =>
                setNewExpense({ ...newExpense, description: e.target.value })
              }
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-gray-900 bg-white"
            />
            <select
              value={newExpense.category}
              onChange={(e) =>
                setNewExpense({
                  ...newExpense,
                  category: e.target.value,
                  userId: "",
                })
              }
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-gray-900 bg-white"
            >
              <option value="Agua">Agua</option>
              <option value="Luz">Luz</option>
              <option value="Renta">Renta</option>
              <option value="Reposicion">Reposicion</option>
              <option value="Comisiones">Comisiones</option>
            </select>
            {newExpense.category === "Comisiones" && (
              <select
                value={newExpense.userId}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, userId: e.target.value })
                }
                className="px-4 py-2 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white font-semibold"
              >
                <option value="">Seleccionar Personal</option>
                {users
                  .filter((u) => u.role === "staff")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            )}
            <input
              type="number"
              step="0.01"
              placeholder="Monto $"
              value={newExpense.amount}
              onChange={(e) =>
                setNewExpense({ ...newExpense, amount: e.target.value })
              }
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-gray-900 bg-white"
            />
            <button
              onClick={addExpense}
              className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:shadow-lg transition font-semibold"
            >
              Agregar Gasto
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                    Concepto
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      No hay gastos registrados
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="border-b hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4 text-sm">{expense.date}</td>
                      <td className="px-6 py-4 text-sm font-medium">
                        {expense.description}
                      </td>
                      <td className="px-6 py-4 text-sm">{expense.category}</td>
                      <td className="px-6 py-4 text-sm font-bold text-red-600">
                        ${expense.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Eliminar gasto"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {consumableUsage.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={24} className="text-orange-500" />
              Consumibles Más Usados
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Categoría
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Servicios
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600">
                      Costo Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {consumableUsage.map((item) => (
                    <tr
                      key={item.category}
                      className="border-b hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 text-sm font-medium capitalize">
                        {item.category}
                      </td>
                      <td className="px-6 py-4 text-sm">{item.count}</td>
                      <td className="px-6 py-4 text-sm font-bold text-orange-600">
                        ${item.totalCost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-800">
              Todos los Servicios
            </h3>
            <button
              onClick={() =>
                exportToCSV(filteredServices, "todos_los_servicios")
              }
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Empleada
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Servicio
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Pago
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Costo
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Comisión
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Reposición
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      No hay servicios
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((service) => (
                    <tr
                      key={service.id}
                      className={`border-b hover:bg-gray-50 transition ${
                        service.deleted ? "opacity-50 bg-red-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-sm">{service.date}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {service.userName}
                      </td>
                      <td className="px-4 py-3 text-sm">{service.client}</td>
                      <td className="px-4 py-3 text-sm">{service.service}</td>
                      <td className="px-4 py-3 text-sm">
                        {service.paymentMethod === "transfer"
                          ? "Transferencia"
                          : "Efectivo"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {editingServiceId === service.id ? (
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.01"
                              value={editingServiceCost}
                              onChange={(e) =>
                                setEditingServiceCost(e.target.value)
                              }
                              className="w-24 px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-green-500 focus:outline-none"
                            />
                            <button
                              onClick={() =>
                                updateServiceCost(
                                  service.id,
                                  parseFloat(editingServiceCost),
                                )
                              }
                              className="text-green-600 hover:text-green-800"
                            >
                              <Check size={18} />
                            </button>
                            <button
                              onClick={() => setEditingServiceId(null)}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-green-600">
                              ${Number(service.cost).toFixed(2)}
                            </span>
                            <button
                              onClick={() => {
                                setEditingServiceId(service.id);
                                setEditingServiceCost(service.cost.toString());
                              }}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Edit2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-blue-600">
                        ${calcCommissionAmount(service).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-orange-600">
                        $
                        {(
                          service.reposicion || getRecipeCost(service.category)
                        ).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          {service.deleted ? (
                            <>
                              <button
                                onClick={() =>
                                  restoreDeletedService(service.id)
                                }
                                className="text-green-600 hover:text-green-800"
                                title="Restaurar"
                              >
                                <CheckCircle size={18} />
                              </button>
                              <button
                                onClick={() =>
                                  permanentlyDeleteService(service.id)
                                }
                                className="text-red-600 hover:text-red-800"
                                title="Eliminar permanentemente"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() =>
                                  softDeleteServiceAdmin(service.id)
                                }
                                className="text-orange-600 hover:text-orange-800"
                                title="Eliminar temporalmente"
                              >
                                <XCircle size={18} />
                              </button>
                              <button
                                onClick={() =>
                                  permanentlyDeleteService(service.id)
                                }
                                className="text-red-600 hover:text-red-800"
                                title="Eliminar permanentemente"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ====== Analytics Tab ======
  const AnalyticsTab = () => {
    const [analyticsFilter, setAnalyticsFilter] = useState<
      "week" | "month" | "year" | "custom"
    >("week");
    const [customDateFrom, setCustomDateFrom] = useState(
      new Date().toISOString().split("T")[0],
    );
    const [customDateTo, setCustomDateTo] = useState(
      new Date().toISOString().split("T")[0],
    );

    // Calcular rango de fechas según filtro
    const getDateRange = () => {
      const today = new Date();
      let from = new Date();
      let to = new Date(today);

      switch (analyticsFilter) {
        case "week":
          from = new Date(today);
          from.setDate(today.getDate() - today.getDay()); // Inicio de semana (domingo)
          break;
        case "month":
          from = new Date(today.getFullYear(), today.getMonth(), 1);
          break;
        case "year":
          from = new Date(today.getFullYear(), 0, 1);
          break;
        case "custom":
          from = new Date(customDateFrom);
          to = new Date(customDateTo);
          break;
      }

      return {
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0],
      };
    };

    const dateRange = getDateRange();

    // Filtrar servicios en el rango
    const filteredServices = services.filter((s) => {
      if (s.deleted) return false;
      return s.date >= dateRange.from && s.date <= dateRange.to;
    });

    // Calcular datos por día de semana
    const weekdayData = {
      Lunes: { revenue: 0, services: 0 },
      Martes: { revenue: 0, services: 0 },
      Miércoles: { revenue: 0, services: 0 },
      Jueves: { revenue: 0, services: 0 },
      Viernes: { revenue: 0, services: 0 },
      Sábado: { revenue: 0, services: 0 },
      Domingo: { revenue: 0, services: 0 },
    };

    const weekdayNames = [
      "Domingo",
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
    ];

    filteredServices.forEach((s) => {
      const date = new Date(s.date);
      const dayName = weekdayNames[date.getDay()];
      weekdayData[dayName as keyof typeof weekdayData].revenue += s.cost;
      weekdayData[dayName as keyof typeof weekdayData].services += 1;
    });

    // Calcular datos diarios para gráfica de tendencia
    const dailyData: Record<string, { revenue: number; services: number }> = {};
    filteredServices.forEach((s) => {
      if (!dailyData[s.date]) {
        dailyData[s.date] = { revenue: 0, services: 0 };
      }
      dailyData[s.date].revenue += s.cost;
      dailyData[s.date].services += 1;
    });

    const sortedDailyData = Object.entries(dailyData)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString("es-ES", {
          month: "short",
          day: "numeric",
        }),
        revenue: data.revenue,
        services: data.services,
      }));

    // Calcular métricas
    const totalIncome = filteredServices.reduce((sum, s) => sum + s.cost, 0);
    const totalServices = filteredServices.length;
    const averageTicket = totalServices > 0 ? totalIncome / totalServices : 0;

    // Empleada con más ingresos
    const staffStats: Record<string, { revenue: number; services: number }> =
      {};
    filteredServices.forEach((s) => {
      if (!staffStats[s.userName]) {
        staffStats[s.userName] = { revenue: 0, services: 0 };
      }
      staffStats[s.userName].revenue += s.cost;
      staffStats[s.userName].services += 1;
    });

    const topStaff = Object.entries(staffStats).sort(
      ([, a], [, b]) => b.revenue - a.revenue,
    )[0];

    // Servicio más vendido
    const serviceStats: Record<string, { count: number; revenue: number }> = {};
    filteredServices.forEach((s) => {
      const serviceName =
        s.services?.[0]?.serviceName || s.service || "Sin especificar";
      if (!serviceStats[serviceName]) {
        serviceStats[serviceName] = { count: 0, revenue: 0 };
      }
      serviceStats[serviceName].count += 1;
      serviceStats[serviceName].revenue += s.cost;
    });

    const topService = Object.entries(serviceStats).sort(
      ([, a], [, b]) => b.count - a.count,
    )[0];

    return (
      <div className="space-y-6">
        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Filtros</h3>
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => setAnalyticsFilter("week")}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                analyticsFilter === "week"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Esta semana
            </button>
            <button
              onClick={() => setAnalyticsFilter("month")}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                analyticsFilter === "month"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Este mes
            </button>
            <button
              onClick={() => setAnalyticsFilter("year")}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                analyticsFilter === "year"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Este año
            </button>
            <button
              onClick={() => setAnalyticsFilter("custom")}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                analyticsFilter === "custom"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Personalizado
            </button>
          </div>

          {analyticsFilter === "custom" && (
            <div className="flex gap-4">
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
              />
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
              />
            </div>
          )}

          <p className="text-sm text-gray-600 mt-4">
            Período: <strong>{dateRange.from}</strong> a{" "}
            <strong>{dateRange.to}</strong>
          </p>
        </div>

        {/* Métricas principales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-green-400 to-green-600 text-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold opacity-90">Total Ingresos</h4>
            <p className="text-3xl font-bold mt-2">${totalIncome.toFixed(2)}</p>
            <p className="text-green-100 text-xs mt-2">
              {totalServices} servicios
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-400 to-blue-600 text-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold opacity-90">
              Ticket Promedio
            </h4>
            <p className="text-3xl font-bold mt-2">
              ${averageTicket.toFixed(2)}
            </p>
            <p className="text-blue-100 text-xs mt-2">por servicio</p>
          </div>

          <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold opacity-90">
              Empleada Destaque
            </h4>
            <p className="text-2xl font-bold mt-2">{topStaff?.[0] || "N/A"}</p>
            <p className="text-orange-100 text-xs mt-2">
              ${topStaff?.[1].revenue.toFixed(2) || "0.00"}
            </p>
          </div>

          <div className="bg-gradient-to-br from-pink-400 to-pink-600 text-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold opacity-90">Servicio Top</h4>
            <p className="text-2xl font-bold mt-2 truncate">
              {topService?.[0] || "N/A"}
            </p>
            <p className="text-pink-100 text-xs mt-2">
              {topService?.[1].count} servicios
            </p>
          </div>
        </div>

        {/* Gráfica por día de semana */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            Ingresos por Día de Semana
          </h3>
          <div className="overflow-x-auto">
            <div className="flex gap-4 pb-4" style={{ minWidth: "100%" }}>
              {Object.entries(weekdayData)
                .filter(([day]) => day !== "Domingo")
                .map(([day, data]) => {
                  const maxRevenue = Math.max(
                    ...Object.values(weekdayData).map((d) => d.revenue),
                  );
                  const heightPercent =
                    maxRevenue > 0 ? (data.revenue / maxRevenue) * 100 : 0;

                  return (
                    <div key={day} className="flex-1 min-w-20">
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="w-full bg-gray-100 rounded-lg relative"
                          style={{ height: "200px" }}
                        >
                          <div
                            className="bg-gradient-to-t from-purple-500 to-purple-300 rounded-lg absolute bottom-0 w-full transition-all duration-300"
                            style={{ height: `${heightPercent}%` }}
                          />
                        </div>
                        <p className="text-sm font-semibold text-gray-700">
                          {day}
                        </p>
                        <p className="text-xs text-gray-600">
                          ${data.revenue.toFixed(0)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {data.services} servicios
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Gráfica de tendencia diaria */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            Tendencia Diaria
          </h3>
          <div className="overflow-x-auto">
            <div className="flex gap-2 pb-4" style={{ minWidth: "100%" }}>
              {sortedDailyData.length > 0 ? (
                sortedDailyData.map((day, idx) => {
                  const maxRevenue = Math.max(
                    ...sortedDailyData.map((d) => d.revenue),
                    1,
                  );
                  const heightPercent = (day.revenue / maxRevenue) * 100;

                  return (
                    <div key={idx} className="flex-1 min-w-16">
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="w-full bg-gray-100 rounded-lg relative"
                          style={{ height: "150px" }}
                        >
                          <div
                            className="bg-gradient-to-t from-blue-500 to-blue-300 rounded-lg absolute bottom-0 w-full transition-all duration-300"
                            style={{ height: `${heightPercent}%` }}
                          />
                        </div>
                        <p className="text-xs font-semibold text-gray-700">
                          {day.date}
                        </p>
                        <p className="text-xs text-gray-600">
                          ${day.revenue.toFixed(0)}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center w-full">
                  Sin datos disponibles
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Gráfica de dona - Servicios más vendidos */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            Servicios Más Vendidos
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Dona */}
            <div className="flex justify-center items-center">
              {Object.entries(serviceStats).length > 0 ? (
                <svg width="200" height="200" viewBox="0 0 200 200">
                  {(() => {
                    const total = Object.values(serviceStats).reduce(
                      (sum, s) => sum + s.count,
                      0,
                    );
                    const colors = [
                      "#FF6B6B",
                      "#4ECDC4",
                      "#45B7D1",
                      "#FFA07A",
                      "#98D8C8",
                      "#F7DC6F",
                      "#BB8FCE",
                      "#85C1E2",
                    ];
                    let currentAngle = -90;

                    return Object.entries(serviceStats)
                      .sort(([, a], [, b]) => b.count - a.count)
                      .map(([service, data], idx) => {
                        const percentage = (data.count / total) * 100;
                        const sliceAngle = (data.count / total) * 360;
                        const startAngle = currentAngle;
                        const endAngle = currentAngle + sliceAngle;
                        currentAngle = endAngle;

                        const startRad = (startAngle * Math.PI) / 180;
                        const endRad = (endAngle * Math.PI) / 180;
                        const innerRadius = 60;
                        const outerRadius = 90;

                        const x1Inner = 100 + innerRadius * Math.cos(startRad);
                        const y1Inner = 100 + innerRadius * Math.sin(startRad);
                        const x2Inner = 100 + innerRadius * Math.cos(endRad);
                        const y2Inner = 100 + innerRadius * Math.sin(endRad);

                        const x1Outer = 100 + outerRadius * Math.cos(startRad);
                        const y1Outer = 100 + outerRadius * Math.sin(startRad);
                        const x2Outer = 100 + outerRadius * Math.cos(endRad);
                        const y2Outer = 100 + outerRadius * Math.sin(endRad);

                        const largeArc = sliceAngle > 180 ? 1 : 0;

                        const pathData = [
                          `M ${x1Outer} ${y1Outer}`,
                          `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
                          `L ${x2Inner} ${y2Inner}`,
                          `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}`,
                          "Z",
                        ].join(" ");

                        return (
                          <path
                            key={idx}
                            d={pathData}
                            fill={colors[idx % colors.length]}
                            stroke="white"
                            strokeWidth="2"
                          />
                        );
                      });
                  })()}
                </svg>
              ) : (
                <p className="text-gray-500">Sin datos disponibles</p>
              )}
            </div>

            {/* Leyenda y detalles */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {Object.entries(serviceStats)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([service, data], idx) => {
                  const total = Object.values(serviceStats).reduce(
                    (sum, s) => sum + s.count,
                    0,
                  );
                  const percentage = ((data.count / total) * 100).toFixed(1);
                  const colors = [
                    "#FF6B6B",
                    "#4ECDC4",
                    "#45B7D1",
                    "#FFA07A",
                    "#98D8C8",
                    "#F7DC6F",
                    "#BB8FCE",
                    "#85C1E2",
                  ];

                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{
                          backgroundColor: colors[idx % colors.length],
                        }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {service}
                        </p>
                        <p className="text-xs text-gray-600">
                          {data.count} servicios • ${data.revenue.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-800">
                          {percentage}%
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ====== Owner Config Tab ======
  const OwnerConfigTab = () => {
    const [newCatalogService, setNewCatalogService] = useState({
      name: "",
      category: "manicura" as "manicura" | "pedicura",
      basePrice: "",
    });

    const [newConsumable, setNewConsumable] = useState({
      name: "",
      unit: "",
      unitCost: "",
      stockQty: "",
      minStockAlert: "",
    });

    const [editingExtraId, setEditingExtraId] = useState<string | null>(null);
    const [newExtraName, setNewExtraName] = useState("");
    const [newExtraPrice, setNewExtraPrice] = useState("");

    const [newUser, setNewUser] = useState({
      name: "",
      pin: "",
      commissionPct: "",
      color: "from-blue-500 to-blue-600",
    });

    const [editingUserCommission, setEditingUserCommission] = useState<
      string | null
    >(null);
    const [editingCommissionValue, setEditingCommissionValue] = useState("");

    // Descargar catálogo de servicios
    const descargarCatalogoFaltante = async () => {
      const nombreColeccion = "catalog_services"; // El nombre exacto que me diste

      try {
        console.log("⏳ Conectando a la base de datos real...");
        const querySnapshot = await getDocs(collection(db, nombreColeccion));

        if (querySnapshot.empty) {
          alert(
            `⚠️ La colección '${nombreColeccion}' está vacía o no existe en este proyecto.`,
          );
          return;
        }

        // Extraemos los datos guardando el ID original como "_id"
        // Esto es vital para que al subirlo, las recetas no se rompan.
        const listaServicios = querySnapshot.docs.map((doc: any) => ({
          _id: doc.id,
          ...doc.data(),
        }));

        // Preparamos el objeto final
        const backupJson = {
          catalog_services: listaServicios,
        };

        // Generamos la descarga del archivo
        const blob = new Blob([JSON.stringify(backupJson, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "solo_catalogo.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        alert(
          `✅ ¡Éxito! Se han descargado ${listaServicios.length} servicios en 'solo_catalogo.json'.`,
        );
        showNotification(
          `Catálogo descargado: ${listaServicios.length} servicios`,
        );
      } catch (error) {
        console.error("Error al descargar:", error);
        alert(
          "❌ Error. ¿Estás seguro de que tienes las credenciales del proyecto REAL?",
        );
        showNotification("Error al descargar catálogo", "error");
      }
    };

    // Crear nuevo usuario
    const createNewUser = async () => {
      if (!newUser.name || !newUser.pin || !newUser.commissionPct) {
        showNotification("Completa todos los campos", "error");
        return;
      }

      const commPct = parseFloat(newUser.commissionPct);
      if (!Number.isFinite(commPct) || commPct < 0 || commPct > 100) {
        showNotification("Porcentaje de comisión inválido (0-100)", "error");
        return;
      }

      if (newUser.pin.length < 4) {
        showNotification("PIN debe tener al menos 4 dígitos", "error");
        return;
      }

      try {
        await addDoc(collection(db, "users"), {
          name: newUser.name.trim(),
          pin: newUser.pin.trim(),
          role: "staff",
          color: newUser.color,
          icon: "user",
          commissionPct: commPct,
          active: true,
          createdAt: serverTimestamp(),
        });

        setNewUser({
          name: "",
          pin: "",
          commissionPct: "",
          color: "from-blue-500 to-blue-600",
        });
        showNotification("Usuario creado exitosamente");
      } catch (error) {
        console.error("Error creando usuario:", error);
        showNotification("Error al crear usuario", "error");
      }
    };

    // Actualizar comisión de usuario
    const updateUserCommission = async (
      userId: string,
      newCommission: number,
    ) => {
      if (
        !Number.isFinite(newCommission) ||
        newCommission < 0 ||
        newCommission > 100
      ) {
        showNotification("Porcentaje inválido (0-100)", "error");
        return;
      }

      try {
        await updateDoc(doc(db, "users", userId), {
          commissionPct: newCommission,
        });
        setEditingUserCommission(null);
        showNotification("Comisión actualizada");
      } catch (error) {
        console.error("Error actualizando comisión:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    // Desactivar usuario
    const deactivateUser = async (userId: string) => {
      if (!window.confirm("¿Desactivar este usuario?")) return;

      try {
        await updateDoc(doc(db, "users", userId), {
          active: false,
        });
        showNotification("Usuario desactivado");
      } catch (error) {
        console.error("Error desactivando usuario:", error);
        showNotification("Error al desactivar", "error");
      }
    };

    // Eliminar usuario permanentemente
    const deleteUserPermanently = async (userId: string) => {
      if (
        !window.confirm(
          "¿Eliminar este usuario permanentemente? Esta acción no se puede deshacer.",
        )
      )
        return;

      try {
        await deleteDoc(doc(db, "users", userId));
        showNotification("Usuario eliminado permanentemente");
      } catch (error) {
        console.error("Error eliminando usuario:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    const addCatalogService = async () => {
      if (!newCatalogService.name || !newCatalogService.basePrice) {
        showNotification("Completa todos los campos", "error");
        return;
      }

      const basePrice = parseFloat(newCatalogService.basePrice);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        showNotification("Precio inválido", "error");
        return;
      }

      try {
        await addDoc(collection(db, "catalog_services"), {
          name: newCatalogService.name.trim(),
          category: newCatalogService.category,
          basePrice,
          active: true,
          createdAt: serverTimestamp(),
        });

        setNewCatalogService({ name: "", category: "manicura", basePrice: "" });
        showNotification("Servicio agregado al catálogo");
      } catch (error) {
        console.error("Error agregando servicio:", error);
        showNotification("Error al agregar", "error");
      }
    };

    const updateCatalogService = async (
      id: string,
      updated: Partial<CatalogService>,
    ) => {
      try {
        await updateDoc(doc(db, "catalog_services", id), updated);
        setEditingCatalogService(null);
        showNotification("Servicio actualizado");
      } catch (error) {
        console.error("Error actualizando servicio:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    const toggleCatalogService = async (id: string, active: boolean) => {
      try {
        await updateDoc(doc(db, "catalog_services", id), { active: !active });
        showNotification(active ? "Servicio desactivado" : "Servicio activado");
      } catch (error) {
        console.error("Error actualizando servicio:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    const deleteCatalogService = async (id: string) => {
      if (!window.confirm("¿Eliminar este servicio del catálogo?")) return;
      try {
        await deleteDoc(doc(db, "catalog_services", id));
        showNotification("Servicio eliminado");
      } catch (error) {
        console.error("Error eliminando servicio:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    // Funciones para gestionar extras
    const addExtra = async () => {
      if (!newExtraName || !newExtraPrice) {
        showNotification("Completa todos los campos", "error");
        return;
      }
      const price = parseFloat(newExtraPrice);
      if (!Number.isFinite(price) || price < 0) {
        showNotification("Precio inválido", "error");
        return;
      }
      try {
        await addDoc(collection(db, "catalog_extras"), {
          name: newExtraName.trim(),
          price,
          priceSuggested: price,
          appliesToCategories: ["manicura", "pedicura"],
          active: true,
          createdAt: serverTimestamp(),
        });
        setNewExtraName("");
        setNewExtraPrice("");
        showNotification("Extra agregado");
      } catch (error) {
        console.error("Error agregando extra:", error);
        showNotification("Error al agregar", "error");
      }
    };

    const updateExtra = async (id: string, name: string, price: number) => {
      try {
        await updateDoc(doc(db, "catalog_extras", id), {
          name,
          price,
          priceSuggested: price,
        });
        setEditingExtraId(null);
        showNotification("Extra actualizado");
      } catch (error) {
        console.error("Error actualizando extra:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    const toggleExtra = async (id: string, active: boolean) => {
      try {
        await updateDoc(doc(db, "catalog_extras", id), { active: !active });
        showNotification(active ? "Extra desactivado" : "Extra activado");
      } catch (error) {
        console.error("Error actualizando extra:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    const deleteExtra = async (id: string) => {
      if (!window.confirm("¿Eliminar este extra?")) return;
      try {
        await deleteDoc(doc(db, "catalog_extras", id));
        showNotification("Extra eliminado");
      } catch (error) {
        console.error("Error eliminando extra:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    const addConsumable = async () => {
      if (
        !newConsumable.name ||
        !newConsumable.unit ||
        !newConsumable.unitCost ||
        !newConsumable.stockQty ||
        !newConsumable.minStockAlert
      ) {
        showNotification("Completa todos los campos", "error");
        return;
      }

      const unitCost = parseFloat(newConsumable.unitCost);
      const stockQty = parseFloat(newConsumable.stockQty);
      const minStockAlert = parseFloat(newConsumable.minStockAlert);

      if (
        !Number.isFinite(unitCost) ||
        !Number.isFinite(stockQty) ||
        !Number.isFinite(minStockAlert)
      ) {
        showNotification("Valores numéricos inválidos", "error");
        return;
      }

      try {
        await addDoc(collection(db, "consumables"), {
          name: newConsumable.name.trim(),
          unit: newConsumable.unit.trim(),
          unitCost,
          stockQty,
          minStockAlert,
          active: true,
          createdAt: serverTimestamp(),
        });

        setNewConsumable({
          name: "",
          unit: "",
          unitCost: "",
          stockQty: "",
          minStockAlert: "",
        });
        showNotification("Consumible agregado");
      } catch (error) {
        console.error("Error agregando consumible:", error);
        showNotification("Error al agregar", "error");
      }
    };

    const updateConsumable = async (
      id: string,
      updated: Partial<Consumable>,
    ) => {
      try {
        await updateDoc(doc(db, "consumables", id), updated);
        setEditingConsumable(null);
        showNotification("Consumible actualizado");
      } catch (error) {
        console.error("Error actualizando consumible:", error);
        showNotification("Error al actualizar", "error");
      }
    };

    const deleteConsumable = async (id: string) => {
      if (!window.confirm("¿Eliminar este consumible?")) return;
      try {
        await deleteDoc(doc(db, "consumables", id));
        showNotification("Consumible eliminado");
      } catch (error) {
        console.error("Error eliminando consumible:", error);
        showNotification("Error al eliminar", "error");
      }
    };

    const lowStockConsumables = consumables.filter(
      (c) => c.active && c.stockQty <= c.minStockAlert,
    );

    return (
      <div className="space-y-6">
        {lowStockConsumables.length > 0 && (
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-300 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-orange-600" size={32} />
              <div>
                <h3 className="text-xl font-bold text-gray-800">
                  ⚠️ Alertas de Stock Bajo
                </h3>
                <p className="text-sm text-gray-600">
                  {lowStockConsumables.length} consumible(s) necesitan
                  reposición
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lowStockConsumables.map((c) => (
                <div
                  key={c.id}
                  className="bg-white rounded-lg p-4 border-2 border-orange-200"
                >
                  <p className="font-bold text-gray-800">{c.name}</p>
                  <p className="text-sm text-gray-600">
                    Stock actual:{" "}
                    <span className="font-bold">{c.stockQty}</span> {c.unit}{" "}
                    (mínimo: {c.minStockAlert})
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4 border-b-2 border-gray-200 pb-2">
          <button
            onClick={() => setCatalogTab("personal")}
            className={`px-6 py-3 rounded-t-lg font-semibold transition ${
              catalogTab === "personal"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Personal
          </button>
          <button
            onClick={() => setCatalogTab("services")}
            className={`px-6 py-3 rounded-t-lg font-semibold transition ${
              catalogTab === "services"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Servicios
          </button>
          <button
            onClick={() => setCatalogTab("consumables")}
            className={`px-6 py-3 rounded-t-lg font-semibold transition ${
              catalogTab === "consumables"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Consumibles
          </button>
          <button
            onClick={() => setCatalogTab("extras")}
            className={`px-6 py-3 rounded-t-lg font-semibold transition ${
              catalogTab === "extras"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Extras
          </button>
        </div>

        {catalogTab === "services" && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <ShoppingCart size={24} className="text-purple-500" />
              Catálogo de Servicios
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-purple-50 rounded-lg">
              <input
                type="text"
                placeholder="Nombre del servicio"
                value={newCatalogService.name}
                onChange={(e) =>
                  setNewCatalogService({
                    ...newCatalogService,
                    name: e.target.value,
                  })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
              />
              <select
                value={newCatalogService.category}
                onChange={(e) =>
                  setNewCatalogService({
                    ...newCatalogService,
                    category: e.target.value as "manicura" | "pedicura",
                  })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
              >
                <option value="manicura">Manicura</option>
                <option value="pedicura">Pedicura</option>
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Precio base $"
                value={newCatalogService.basePrice}
                onChange={(e) =>
                  setNewCatalogService({
                    ...newCatalogService,
                    basePrice: e.target.value,
                  })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
              />
              <button
                onClick={addCatalogService}
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:shadow-lg transition font-semibold"
              >
                Agregar
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Categoría
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Precio
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {catalogServices.map((cs) => {
                    const isEditing = editingCatalogService === cs.id;
                    let editedCS = { ...cs };

                    return (
                      <tr
                        key={cs.id}
                        className={`border-b hover:bg-gray-50 transition ${
                          !cs.active ? "opacity-60" : ""
                        }`}
                      >
                        {isEditing ? (
                          <>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                defaultValue={cs.name}
                                onChange={(e) =>
                                  (editedCS.name = e.target.value)
                                }
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none w-full"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                defaultValue={cs.category}
                                onChange={(e) =>
                                  (editedCS.category = e.target.value as
                                    | "manicura"
                                    | "pedicura")
                                }
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none"
                              >
                                <option value="manicura">Manicura</option>
                                <option value="pedicura">Pedicura</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={cs.basePrice}
                                onChange={(e) =>
                                  (editedCS.basePrice = parseFloat(
                                    e.target.value,
                                  ))
                                }
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-bold ${
                                  cs.active
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {cs.active ? "Activo" : "Inactivo"}
                              </span>
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              <button
                                onClick={() =>
                                  updateCatalogService(cs.id, editedCS)
                                }
                                className="text-green-600 hover:text-green-800"
                              >
                                <Save size={18} />
                              </button>
                              <button
                                onClick={() => setEditingCatalogService(null)}
                                className="text-gray-500 hover:text-gray-700"
                              >
                                <X size={18} />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-sm font-medium">
                              {cs.name}
                            </td>
                            <td className="px-4 py-3 text-sm">{cs.category}</td>
                            <td className="px-4 py-3 text-sm font-bold text-green-700">
                              ${cs.basePrice.toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-bold ${
                                  cs.active
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {cs.active ? "Activo" : "Inactivo"}
                              </span>
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              <button
                                onClick={() => setEditingCatalogService(cs.id)}
                                className="text-blue-600 hover:text-blue-800"
                                title="Editar"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() =>
                                  toggleCatalogService(cs.id, cs.active)
                                }
                                className={`p-2 rounded-lg transition ${
                                  cs.active
                                    ? "text-orange-600 hover:text-orange-800"
                                    : "text-green-600 hover:text-green-800"
                                }`}
                                title={cs.active ? "Desactivar" : "Activar"}
                              >
                                {cs.active ? (
                                  <XCircle size={18} />
                                ) : (
                                  <CheckCircle size={18} />
                                )}
                              </button>
                              <button
                                onClick={() => deleteCatalogService(cs.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Eliminar"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {catalogTab === "consumables" && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Package size={24} className="text-purple-500" />
              Inventario de Consumibles
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6 p-4 bg-purple-50 rounded-lg">
              <input
                type="text"
                placeholder="Nombre"
                value={newConsumable.name}
                onChange={(e) =>
                  setNewConsumable({ ...newConsumable, name: e.target.value })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
              />
              <input
                type="text"
                placeholder="Unidad"
                value={newConsumable.unit}
                onChange={(e) =>
                  setNewConsumable({ ...newConsumable, unit: e.target.value })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Costo/unidad"
                value={newConsumable.unitCost}
                onChange={(e) =>
                  setNewConsumable({
                    ...newConsumable,
                    unitCost: e.target.value,
                  })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
              />
              <input
                type="number"
                placeholder="Stock inicial"
                value={newConsumable.stockQty}
                onChange={(e) =>
                  setNewConsumable({
                    ...newConsumable,
                    stockQty: e.target.value,
                  })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
              />
              <input
                type="number"
                placeholder="Alerta mínima"
                value={newConsumable.minStockAlert}
                onChange={(e) =>
                  setNewConsumable({
                    ...newConsumable,
                    minStockAlert: e.target.value,
                  })
                }
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
              />
              <button
                onClick={addConsumable}
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:shadow-lg transition font-semibold"
              >
                Agregar
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Unidad
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Costo/unidad
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Stock
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Alerta
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {consumables.map((c) => {
                    const isLowStock = c.stockQty <= c.minStockAlert;
                    const isEditing = editingConsumable === c.id;
                    let editedC = { ...c };

                    return (
                      <tr
                        key={c.id}
                        className={`border-b hover:bg-gray-50 transition ${
                          isLowStock ? "bg-orange-50" : ""
                        }`}
                      >
                        {isEditing ? (
                          <>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                defaultValue={c.name}
                                onChange={(e) =>
                                  (editedC.name = e.target.value)
                                }
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none w-full"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                defaultValue={c.unit}
                                onChange={(e) =>
                                  (editedC.unit = e.target.value)
                                }
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={c.unitCost}
                                onChange={(e) =>
                                  (editedC.unitCost = parseFloat(
                                    e.target.value,
                                  ))
                                }
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                defaultValue={c.stockQty}
                                onChange={(e) =>
                                  (editedC.stockQty = parseFloat(
                                    e.target.value,
                                  ))
                                }
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                defaultValue={c.minStockAlert}
                                onChange={(e) =>
                                  (editedC.minStockAlert = parseFloat(
                                    e.target.value,
                                  ))
                                }
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              <button
                                onClick={() => updateConsumable(c.id, editedC)}
                                className="text-green-600 hover:text-green-800"
                              >
                                <Save size={18} />
                              </button>
                              <button
                                onClick={() => setEditingConsumable(null)}
                                className="text-gray-500 hover:text-gray-700"
                              >
                                <X size={18} />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-sm font-medium">
                              {c.name}
                            </td>
                            <td className="px-4 py-3 text-sm">{c.unit}</td>
                            <td className="px-4 py-3 text-sm">
                              ${c.unitCost.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold">
                              {c.stockQty} {c.unit}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {c.minStockAlert}
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              <button
                                onClick={() => setEditingConsumable(c.id)}
                                className="text-blue-600 hover:text-blue-800"
                                title="Editar"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => deleteConsumable(c.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Eliminar"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {catalogTab === "personal" && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Users size={24} className="text-purple-500" />
              Gestionar Personal
            </h3>

            {/* Crear nuevo usuario */}
            <div className="mb-8 p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
              <h4 className="text-lg font-bold text-blue-900 mb-4">
                Crear Nuevo Usuario
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
                />
                <input
                  type="password"
                  placeholder="PIN (4+ dígitos)"
                  value={newUser.pin}
                  onChange={(e) =>
                    setNewUser({ ...newUser, pin: e.target.value })
                  }
                  className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Comisión %"
                  value={newUser.commissionPct}
                  onChange={(e) =>
                    setNewUser({ ...newUser, commissionPct: e.target.value })
                  }
                  className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
                />
                <select
                  value={newUser.color}
                  onChange={(e) =>
                    setNewUser({ ...newUser, color: e.target.value })
                  }
                  className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
                >
                  <option value="from-blue-500 to-blue-600">Azul</option>
                  <option value="from-pink-500 to-pink-600">Rosa</option>
                  <option value="from-green-500 to-green-600">Verde</option>
                  <option value="from-purple-500 to-purple-600">Morado</option>
                  <option value="from-orange-500 to-orange-600">Naranja</option>
                </select>
                <button
                  onClick={createNewUser}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition font-semibold"
                >
                  <Plus size={18} className="inline mr-2" />
                  Crear Usuario
                </button>
              </div>
            </div>

            {/* Lista de usuarios */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Comisión
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter((u) => u.role === "staff")
                    .map((user) => (
                      <tr
                        key={user.id}
                        className={`border-b hover:bg-gray-50 transition ${
                          !user.active ? "opacity-50 bg-gray-100" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-sm font-medium">
                          {user.name}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {editingUserCommission === user.id ? (
                            <div className="flex gap-2">
                              <input
                                type="number"
                                step="0.1"
                                value={editingCommissionValue}
                                onChange={(e) =>
                                  setEditingCommissionValue(e.target.value)
                                }
                                className="w-20 px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none"
                              />
                              <button
                                onClick={() =>
                                  updateUserCommission(
                                    user.id,
                                    parseFloat(editingCommissionValue),
                                  )
                                }
                                className="text-green-600 hover:text-green-800"
                              >
                                <Check size={18} />
                              </button>
                              <button
                                onClick={() => setEditingUserCommission(null)}
                                className="text-gray-500 hover:text-gray-700"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-purple-600">
                                {user.commissionPct}%
                              </span>
                              <button
                                onClick={() => {
                                  setEditingUserCommission(user.id);
                                  setEditingCommissionValue(
                                    user.commissionPct.toString(),
                                  );
                                }}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Edit2 size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${
                              user.active
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {user.active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <button
                            onClick={() => deactivateUser(user.id)}
                            className={`p-2 rounded-lg transition ${
                              user.active
                                ? "text-orange-600 hover:text-orange-800"
                                : "text-green-600 hover:text-green-800"
                            }`}
                            title={user.active ? "Desactivar" : "Activar"}
                          >
                            {user.active ? (
                              <XCircle size={18} />
                            ) : (
                              <CheckCircle size={18} />
                            )}
                          </button>
                          <button
                            onClick={() => deleteUserPermanently(user.id)}
                            className="text-red-600 hover:text-red-800"
                            title="Eliminar permanentemente"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {catalogTab === "extras" && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-6">
              Gestión de Extras
            </h3>

            {/* Form agregar extra */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
              <h4 className="font-semibold text-gray-700 mb-3">
                Agregar Nuevo Extra
              </h4>
              <div className="flex gap-2 flex-wrap items-end">
                <input
                  type="text"
                  placeholder="Nombre del extra"
                  value={newExtraName}
                  onChange={(e) => setNewExtraName(e.target.value)}
                  className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Precio por uña"
                  value={newExtraPrice}
                  onChange={(e) => setNewExtraPrice(e.target.value)}
                  className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-gray-900 bg-white"
                />
                <button
                  onClick={addExtra}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:shadow-lg transition font-semibold"
                >
                  Agregar
                </button>
              </div>
            </div>

            {/* Tabla de extras */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Precio/Uña
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {catalogExtras.map((extra) => {
                    const price =
                      (extra as any).price || extra.priceSuggested || 0;
                    return (
                      <tr
                        key={extra.id}
                        className={`border-b hover:bg-gray-50 transition ${
                          !extra.active ? "opacity-60" : ""
                        }`}
                      >
                        {editingExtraId === extra.id ? (
                          <>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                defaultValue={extra.name || ""}
                                id={`edit-name-${extra.id}`}
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none w-full"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={price}
                                id={`edit-price-${extra.id}`}
                                className="px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white focus:border-purple-500 focus:outline-none w-20"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-bold ${
                                  extra.active
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {extra.active ? "Activo" : "Inactivo"}
                              </span>
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              <button
                                onClick={() => {
                                  const nameInput = document.getElementById(
                                    `edit-name-${extra.id}`,
                                  ) as HTMLInputElement;
                                  const priceInput = document.getElementById(
                                    `edit-price-${extra.id}`,
                                  ) as HTMLInputElement;
                                  updateExtra(
                                    extra.id,
                                    nameInput.value,
                                    parseFloat(priceInput.value) || 0,
                                  );
                                }}
                                className="text-green-600 hover:text-green-800"
                              >
                                <Save size={18} />
                              </button>
                              <button
                                onClick={() => setEditingExtraId(null)}
                                className="text-gray-500 hover:text-gray-700"
                              >
                                <X size={18} />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 font-semibold text-gray-900">
                              {extra.name || "Sin nombre"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              ${price.toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-bold cursor-pointer ${
                                  extra.active
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                                onClick={() =>
                                  toggleExtra(extra.id, extra.active)
                                }
                              >
                                {extra.active ? "Activo" : "Inactivo"}
                              </span>
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              <button
                                onClick={() => setEditingExtraId(extra.id)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => deleteExtra(extra.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {catalogExtras.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No hay extras registrados
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ====== Owner Screen ======
  const OwnerScreen = () => {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-6 shadow-lg">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Panel de Administración</h1>
              <p className="text-white/80">Bienvenida, {currentUser?.name}</p>
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
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setOwnerTab("dashboard")}
              className={`px-6 py-3 rounded-lg font-semibold transition ${
                ownerTab === "dashboard"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setOwnerTab("analytics")}
              className={`px-6 py-3 rounded-lg font-semibold transition ${
                ownerTab === "analytics"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              Análisis
            </button>
            <button
              onClick={() => setOwnerTab("config")}
              className={`px-6 py-3 rounded-lg font-semibold transition ${
                ownerTab === "config"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              Configuración
            </button>
          </div>

          {ownerTab === "dashboard" && <OwnerDashboard />}
          {ownerTab === "analytics" && <AnalyticsTab />}
          {ownerTab === "config" && <OwnerConfigTab />}
        </div>
      </div>
    );
  };

  // ====== Render ======
  if (!currentUser) return <LoginScreen />;
  if (currentUser.role === "owner") return <OwnerScreen />;
  return <StaffScreen />;
};

export default SalonApp;
