import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// --- BUSCADOR AUTOMÁTICO DE LLAVE ---
const posiblesRutas = [
  path.join(process.cwd(), "serviceAccountKey.json"), // Misma carpeta
  path.join(process.cwd(), "..", "serviceAccountKey.json"), // Carpeta de arriba (ap 2)
  path.join(process.cwd(), "..", "..", "serviceAccountKey.json"), // Dos carpetas arriba
];

let keyPath = "";
for (const ruta of posiblesRutas) {
  if (fs.existsSync(ruta)) {
    keyPath = ruta;
    break;
  }
}

if (!keyPath) {
  console.error(
    "❌ ERROR: No se encontró 'serviceAccountKey.json' en ninguna carpeta."
  );
  console.log(
    "👉 Asegúrate de que el archivo de la llave esté en la carpeta del proyecto."
  );
  process.exit(1);
}

console.log(`🔑 Llave encontrada en: ${keyPath}`);
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const IDS = {
  bastoncillos: "1clLrpqdlj5zzVRLe5HP",
  toallaDesechable: "4N4c2dL5fFBy1brXjyCa",
  wipes: "4clbiTpv0MbKH8j37o6K",
  moldesEsculpir: "B8BW879ma0oDovuliYa5",
  guantesPar: "L1HcXt1vp2j5Pl73OpIQ",
  campoQuirurgico: "Qp09d7wSiBnr1njgpSTN",
  mascarillas: "Uhifbgvwv7IvlnyCF84L",
  papelFilm: "a1DvQBwlxO9p2foX2sJq",
  gorro: "d4nwC2fhUfOkMV36tYW1",
  algodon: "goCNoZJEu51ryFpxMoXg",
  palilloNaranja: "oK8kK55DrFVXEGHkSj1h",
};

async function resetAndBuildRecipes() {
  try {
    console.log("🗑️ Borrando recetas antiguas de 'service_recipes'...");
    const oldRecipes = await db.collection("service_recipes").get();
    const batch = db.batch();
    oldRecipes.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();

    console.log("🔍 Analizando servicios para asignar nuevas recetas...");
    const servicesSnap = await db.collection("catalog_services").get();

    for (const doc of servicesSnap.docs) {
      const service = doc.data();
      const serviceId = doc.id;
      const categoria = service.category?.toLowerCase();

      let items: any[] = [];
      let tipo = "";

      if (categoria === "manicura") {
        tipo = "MANICURA_STANDARD";
        items = [
          { consumableId: IDS.guantesPar, qty: 1 },
          { consumableId: IDS.mascarillas, qty: 1 },
          { consumableId: IDS.palilloNaranja, qty: 1 },
          { consumableId: IDS.bastoncillos, qty: 1 },
          { consumableId: IDS.wipes, qty: 1 },
          { consumableId: IDS.toallaDesechable, qty: 1 },
          { consumableId: IDS.gorro, qty: 1 },
          { consumableId: IDS.campoQuirurgico, qty: 1 },
          { consumableId: IDS.moldesEsculpir, qty: 1 },
        ];
      } else if (categoria === "pedicura") {
        tipo = "PEDICURA_STANDARD";
        items = [
          { consumableId: IDS.campoQuirurgico, qty: 1 },
          { consumableId: IDS.algodon, qty: 5 },
          { consumableId: IDS.papelFilm, qty: 0.8 },
          { consumableId: IDS.guantesPar, qty: 1 },
          { consumableId: IDS.mascarillas, qty: 1 },
          { consumableId: IDS.palilloNaranja, qty: 1 },
          { consumableId: IDS.wipes, qty: 1 },
          { consumableId: IDS.gorro, qty: 1 },
          { consumableId: IDS.bastoncillos, qty: 1 },
        ];
      }

      if (items.length > 0) {
        await db.collection("service_recipes").doc(serviceId).set({
          tipo,
          serviceName: service.name,
          items,
          lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ Receta ${tipo} creada para: ${service.name}`);
      }
    }
    console.log("\n🚀 ¡PROCESO COMPLETADO EXITOSAMENTE!");
  } catch (error) {
    console.error("❌ Error durante el proceso:", error);
  } finally {
    process.exit();
  }
}

resetAndBuildRecipes();
